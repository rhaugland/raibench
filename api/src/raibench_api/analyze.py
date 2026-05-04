"""AI-powered pipeline analysis using Claude."""

from __future__ import annotations

import json
import os
import time
from typing import Any

import httpx

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# In-memory cache: {pipeline_id: (timestamp, suggestions)}
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
CACHE_TTL = 3600  # 1 hour


async def get_suggestions(
    pipeline_id: str,
    metrics: dict[str, Any],
) -> list[dict[str, Any]]:
    """Get AI-powered optimization suggestions for a pipeline."""

    # Check cache
    if pipeline_id in _cache:
        cached_at, cached = _cache[pipeline_id]
        if time.time() - cached_at < CACHE_TTL:
            return cached

    if not ANTHROPIC_API_KEY:
        return _fallback_suggestions(metrics)

    try:
        suggestions = await _call_claude(pipeline_id, metrics)
        _cache[pipeline_id] = (time.time(), suggestions)
        return suggestions
    except Exception:
        return _fallback_suggestions(metrics)


async def _call_claude(
    pipeline_id: str,
    metrics: dict[str, Any],
) -> list[dict[str, Any]]:
    prompt = f"""You are RAIRCADE's AI optimization engine. Analyze this AI pipeline's metrics and give specific, actionable suggestions.

Pipeline: {pipeline_id}
Metrics:
- Total events: {metrics.get("total_events", 0):,}
- Success rate: {metrics.get("success_rate", 0):.1%}
- p50 latency: {metrics.get("p50_latency_ms", "N/A")}ms
- p95 latency: {metrics.get("p95_latency_ms", "N/A")}ms
- Total cost: {metrics.get("total_cost_cents", 0) / 100:.2f} USD
- Cost per event: {metrics.get("total_cost_cents", 0) / max(metrics.get("total_events", 1), 1):.4f} cents

Return exactly 4 suggestions as a JSON array. Each suggestion must have:
- "title": short action title (5-8 words)
- "description": 1-2 sentences explaining why and what to do
- "code": working Python code snippet (10-20 lines) they can copy-paste
- "impact": specific quantified impact estimate based on the actual numbers above
- "difficulty": "easy", "medium", or "hard"
- "category": "success", "latency", "cost", or "volume"

Focus on the weakest metrics first. Be specific to their actual numbers — don't give generic advice.
Use real Python libraries (tenacity, anthropic, openai, numpy, asyncio).
Make the code production-ready, not pseudocode.

Return ONLY the JSON array, no markdown fences or other text."""

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 2048,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["content"][0]["text"].strip()

        # Strip markdown fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]

        suggestions = json.loads(text)
        if not isinstance(suggestions, list):
            return _fallback_suggestions(metrics)
        return suggestions


def _fallback_suggestions(metrics: dict[str, Any]) -> list[dict[str, Any]]:
    """Pattern-matched fallback when AI is unavailable."""
    tips: list[dict[str, Any]] = []
    sr = metrics.get("success_rate", 1.0)
    p50 = metrics.get("p50_latency_ms") or 0
    total_events = metrics.get("total_events", 0)
    total_cost = metrics.get("total_cost_cents", 0)
    cpe = total_cost / max(total_events, 1)

    if sr < 0.9:
        tips.append({
            "title": "Add retry with exponential backoff",
            "description": f"Your {sr:.0%} success rate means ~{(1-sr)*100:.0f}% of calls fail. Retries with backoff recover most transient errors automatically.",
            "code": """from tenacity import retry, wait_exponential, stop_after_attempt

@retry(
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
)
async def call_provider(prompt: str):
    return await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    )""",
            "impact": f"Could recover ~{(1-sr)*50:.0f}% of current failures",
            "difficulty": "easy",
            "category": "success",
        })
    else:
        tips.append({
            "title": "Add canary health checks",
            "description": f"At {sr:.1%} success rate you're solid. Add canary tests to catch regressions before users do.",
            "code": """async def canary_check():
    result = await my_pipeline("What is 2+2?")
    assert "4" in result, f"Canary failed: {result}"
    print("Canary passed")""",
            "impact": "Catch regressions in <5 minutes",
            "difficulty": "easy",
            "category": "success",
        })

    if p50 > 2000:
        tips.append({
            "title": "Switch to streaming responses",
            "description": f"At {p50}ms median latency, users wait too long. Streaming shows first tokens in ~200ms.",
            "code": """stream = await client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": query}],
    stream=True,
)
async for chunk in stream:
    token = chunk.choices[0].delta.content or ""
    yield token""",
            "impact": f"First token in ~200ms vs {p50}ms wait",
            "difficulty": "medium",
            "category": "latency",
        })
    elif p50 > 500:
        tips.append({
            "title": "Add semantic caching for repeats",
            "description": f"At {p50}ms, caching similar queries could serve instant answers for repeat questions.",
            "code": """from functools import lru_cache

@lru_cache(maxsize=1000)
def cached_generate(query_hash: str, query: str):
    return client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": query}],
    )""",
            "impact": f"{p50}ms -> ~5ms for cached queries",
            "difficulty": "medium",
            "category": "latency",
        })
    else:
        tips.append({
            "title": "Monitor p95 tail latency",
            "description": f"Median is great at {p50}ms. Watch your p95 to catch slow outliers.",
            "code": """# Set alert threshold at 3x your p50
LATENCY_ALERT_MS = """ + str(p50 * 3) + """

# Check in your monitoring loop
if event.latency_ms > LATENCY_ALERT_MS:
    send_alert(f"Slow query: {event.latency_ms}ms")""",
            "impact": "Catch slow outliers before users complain",
            "difficulty": "easy",
            "category": "latency",
        })

    if cpe > 5:
        tips.append({
            "title": "Route simple queries to cheaper models",
            "description": f"At {cpe:.1f}¢/event, routing easy queries to GPT-4o-mini or Haiku saves 60-80%.",
            "code": """def pick_model(query: str) -> str:
    if len(query.split()) < 20:
        return "gpt-4o-mini"   # ~$0.15/1M tokens
    return "gpt-4o"            # ~$2.50/1M tokens

response = await client.chat.completions.create(
    model=pick_model(query),
    messages=[{"role": "user", "content": query}],
)""",
            "impact": "60-80% cost reduction on simple queries",
            "difficulty": "medium",
            "category": "cost",
        })
    else:
        tips.append({
            "title": "Enable prompt caching",
            "description": "Cache your system prompt prefix for 50-90% savings on repeated tokens.",
            "code": """response = await anthropic.messages.create(
    model="claude-sonnet-4-20250514",
    system=[{
        "type": "text",
        "text": "Your system prompt...",
        "cache_control": {"type": "ephemeral"},
    }],
    messages=[{"role": "user", "content": query}],
)""",
            "impact": "~50% off cached system prompt tokens",
            "difficulty": "easy",
            "category": "cost",
        })

    if total_events < 100:
        tips.append({
            "title": "Run a load test for baselines",
            "description": f"{total_events} events isn't enough for reliable metrics. Run 100+ queries to establish baselines.",
            "code": """import asyncio

QUERIES = ["How do I reset my password?", "What's your refund policy?", ...]

async def load_test():
    results = await asyncio.gather(
        *[my_pipeline(q) for q in QUERIES],
        return_exceptions=True,
    )
    ok = sum(1 for r in results if not isinstance(r, Exception))
    print(f"{ok}/{len(results)} succeeded")

asyncio.run(load_test())""",
            "impact": "Statistical confidence in your metrics",
            "difficulty": "easy",
            "category": "volume",
        })
    else:
        tips.append({
            "title": "Segment events by task category",
            "description": f"With {total_events:,} events, segment by use case to find which ones need optimization.",
            "code": """@monitor.trace(stage="generation", task_category="support-qa")
async def answer_support(query: str):
    return await client.create(...)

@monitor.trace(stage="generation", task_category="code-gen")
async def generate_code(query: str):
    return await client.create(...)""",
            "impact": "Find which use cases to optimize first",
            "difficulty": "easy",
            "category": "volume",
        })

    return tips

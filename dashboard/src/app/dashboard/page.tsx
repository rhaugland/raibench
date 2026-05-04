"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch, apiDownload } from "@/lib/api";
import { DEMO_PIPELINES, DEMO_METRICS, DEMO_TIMESERIES } from "@/lib/demo-data";
import { MetricCard } from "@/components/metric-card";
import { LatencyChart } from "@/components/latency-chart";
import { SuccessRateChart } from "@/components/success-rate-chart";
import { CostChart } from "@/components/cost-chart";

interface Pipeline { pipeline_id: string; event_count: number; last_event: string; }
interface Metrics { pipeline_id: string; total_events: number; success_rate: number; p50_latency_ms: number | null; p95_latency_ms: number | null; total_cost_cents: number; }
interface Bucket { timestamp: string; event_count: number; success_rate: number; p50_latency_ms: number | null; total_cost_cents: number; }
interface PipelineWithMetrics extends Pipeline { metrics: Metrics; }
interface Suggestion { title: string; description: string; code?: string; impact: string; difficulty: "easy" | "medium" | "hard"; category?: string; }

const TABS = ["Setup", "Metrics", "Pipelines", "Leaderboard", "Compare", "Alerts", "Digest"] as const;
type Tab = (typeof TABS)[number];

/* ─── SUGGESTIONS ENGINE ─── */

function getSuggestions(m: Metrics, category: string): Suggestion[] {
  const tips: Suggestion[] = [];

  if (category === "success" || category === "all") {
    if (m.success_rate < 0.8) {
      tips.push({
        title: "Add retry with exponential backoff",
        description: "Your failure rate is critical. Wrap provider calls in a retry decorator to auto-recover from transient 429/500 errors.",
        code: `from tenacity import retry, wait_exponential, stop_after_attempt

@retry(
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((TimeoutError, ConnectionError))
)
async def call_provider(prompt: str):
    return await client.chat.completions.create(...)`,
        impact: `Could recover ~${Math.round((1 - m.success_rate) * 50)}% of current failures`,
        difficulty: "easy",
      });
      tips.push({
        title: "Add a fallback provider chain",
        description: "If your primary provider goes down, auto-route to a backup so your pipeline stays online.",
        code: `PROVIDERS = [
    {"client": openai_client, "model": "gpt-4o"},
    {"client": anthropic_client, "model": "claude-sonnet-4-20250514"},
]

async def call_with_fallback(prompt: str):
    for provider in PROVIDERS:
        try:
            return await provider["client"].create(
                model=provider["model"], messages=[...]
            )
        except Exception:
            continue
    raise RuntimeError("All providers failed")`,
        impact: "Eliminates single-provider downtime",
        difficulty: "medium",
      });
    } else if (m.success_rate < 0.95) {
      tips.push({
        title: "Add input validation",
        description: "Filter malformed or empty inputs before they hit your AI provider. Most sub-95% pipelines lose 3-5% to bad inputs.",
        code: `def validate_input(query: str) -> str:
    query = query.strip()
    if not query:
        raise ValueError("Empty query")
    if len(query) > 10000:
        query = query[:10000]
    return query

@monitor.trace(stage="generation", provider="openai")
async def generate(query: str):
    query = validate_input(query)
    return await client.create(model="gpt-4o", ...)`,
        impact: `Could fix ~${Math.round((0.95 - m.success_rate) * 100)}% of failures`,
        difficulty: "easy",
      });
    } else {
      tips.push({
        title: "Add canary health checks",
        description: "You're crushing it. Add periodic canary tests so you catch regressions before your users do.",
        code: `async def canary_check():
    result = await my_pipeline("What is 2+2?")
    assert "4" in result, f"Canary failed: {result}"
    monitor.track_canary(success=True)`,
        impact: "Catch regressions in <5 minutes",
        difficulty: "easy",
      });
    }
  }

  if (category === "latency" || category === "all") {
    const p50 = m.p50_latency_ms ?? 0;
    if (p50 > 2000) {
      tips.push({
        title: "Switch to streaming responses",
        description: `${p50}ms is too long to stare at a spinner. Stream tokens so users see output in ~200ms.`,
        code: `@monitor.trace(stage="generation", provider="openai")
async def generate_stream(query: str):
    stream = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": query}],
        stream=True,
    )
    async for chunk in stream:
        yield chunk.choices[0].delta.content or ""`,
        impact: `First token in ~200ms vs ${p50}ms wait`,
        difficulty: "medium",
      });
      tips.push({
        title: "Route simple queries to a faster model",
        description: "GPT-4o-mini and Claude Haiku are 3-5x faster. Use them for easy questions, save the big guns for hard ones.",
        code: `def pick_model(query: str) -> str:
    if len(query.split()) < 20:
        return "gpt-4o-mini"   # ~200ms, $0.15/1M
    return "gpt-4o"            # ~800ms, $2.50/1M

@monitor.trace(stage="generation", provider="openai")
async def generate(query: str):
    return await client.create(model=pick_model(query), ...)`,
        impact: "3-5x faster for ~60% of queries",
        difficulty: "medium",
      });
    } else if (p50 > 500) {
      tips.push({
        title: "Add semantic caching",
        description: "If users ask similar questions, serve cached answers instantly instead of calling your model again.",
        code: `import numpy as np

cache: dict[str, tuple[list[float], str]] = {}

async def cached_generate(query: str):
    emb = await get_embedding(query)
    for key, (cached_emb, result) in cache.items():
        if np.dot(emb, cached_emb) > 0.95:
            return result  # Hit! ~0ms
    result = await generate(query)
    cache[query] = (emb, result)
    return result`,
        impact: `${p50}ms -> ~5ms for similar queries`,
        difficulty: "medium",
      });
    } else {
      tips.push({
        title: "Watch your p95 tail latency",
        description: `Median is great at ${p50}ms. Set an alert at 3x your p50 so outliers don't sneak past you.`,
        code: `monitor.init(
    api_key="...",
    pipeline="my-pipeline",
    alert_rules={
        "p95_latency_ms": {"threshold": ${Math.round(p50 * 3)}, "window": "5m"},
    }
)`,
        impact: "Catch slow outliers in <5 minutes",
        difficulty: "easy",
      });
    }
  }

  if (category === "cost" || category === "all") {
    const cpe = m.total_events > 0 ? m.total_cost_cents / m.total_events : 0;
    if (cpe > 5) {
      tips.push({
        title: "Compress your prompts",
        description: `${cpe.toFixed(1)}\u00A2/event is steep. Trim retrieval to top-3 chunks, use structured output, and cut the fluff from your system prompt.`,
        code: `# Before: 5 chunks x 500 tokens = 2500 tokens
context = retriever.search(query, top_k=5)

# After: 3 chunks x 200 tokens = 600 tokens
context = retriever.search(query, top_k=3)
context = [c[:200] for c in context]

response = await client.create(
    model="gpt-4o",
    response_format={"type": "json_object"},
    messages=[{
        "role": "system",
        "content": "Reply as JSON: {answer: str, confidence: float}"
    }, ...]
)`,
        impact: `${cpe.toFixed(1)}\u00A2 -> ~${(cpe * 0.4).toFixed(1)}\u00A2/event`,
        difficulty: "easy",
      });
      tips.push({
        title: "Add a model router",
        description: "Try the cheap model first. If it's confident, ship it. If not, escalate to the big model. Saves 60-80% on average.",
        code: `async def smart_route(query: str):
    fast = await client.create(
        model="gpt-4o-mini", messages=[...], logprobs=True,
    )
    if mean(fast.choices[0].logprobs) > -0.3:
        return fast  # High confidence, saved ~95%
    return await client.create(model="gpt-4o", messages=[...])`,
        impact: "60-80% cost reduction",
        difficulty: "hard",
      });
    } else if (cpe > 1) {
      tips.push({
        title: "Enable prompt caching",
        description: "Same system prompt every call? Providers auto-cache repeated prefixes — 50-90% savings on those tokens for free.",
        code: `response = await anthropic.messages.create(
    model="claude-sonnet-4-20250514",
    system=[{
        "type": "text",
        "text": "Your system prompt...",
        "cache_control": {"type": "ephemeral"},
    }],
    messages=[...],
)  # Cached tokens cost 90% less`,
        impact: "~50% off cached tokens",
        difficulty: "easy",
      });
    } else {
      tips.push({
        title: "Set up cost alerts",
        description: "You're efficient — keep it that way. Alert on 2x daily spend so nothing surprises you.",
        code: `monitor.init(
    api_key="...",
    pipeline="my-pipeline",
    alert_rules={
        "daily_cost_cents": {
            "threshold": ${Math.round(cpe * m.total_events * 2)},
            "window": "24h"
        },
    }
)`,
        impact: "Catch cost spikes within 24h",
        difficulty: "easy",
      });
    }
  }

  if (category === "volume" || category === "all") {
    if (m.total_events < 100) {
      tips.push({
        title: "Run a load test",
        description: `${m.total_events} events isn't enough for confident metrics. Fire off 100+ realistic queries to get a real baseline.`,
        code: `import asyncio

QUERIES = [
    "How do I reset my password?",
    "What is your refund policy?",
    "Explain quantum computing",
    # Add 50+ real queries
]

async def load_test():
    results = await asyncio.gather(
        *[my_pipeline(q) for q in QUERIES],
        return_exceptions=True,
    )
    ok = sum(1 for r in results if not isinstance(r, Exception))
    print(f"{ok}/{len(results)} succeeded")

asyncio.run(load_test())`,
        impact: "Statistical confidence in your metrics",
        difficulty: "easy",
      });
    } else {
      tips.push({
        title: "Segment by task category",
        description: `${m.total_events.toLocaleString()} events is solid. Tag by use case to find which ones need love.`,
        code: `@monitor.trace(stage="generation", task_category="support-qa")
async def answer_support(query: str):
    return await client.create(...)

@monitor.trace(stage="generation", task_category="code-gen")
async def generate_code(query: str):
    return await client.create(...)`,
        impact: "Find which use cases to optimize",
        difficulty: "easy",
      });
    }
  }

  return tips;
}

/* ─── FLIPPABLE CARD ─── */

function FlippableCard({
  label, color, pipeline, value, subtitle, category, demo, apiKey,
}: {
  label: string;
  color: "pink" | "electric" | "mint" | "lavender";
  pipeline: PipelineWithMetrics;
  value: string;
  subtitle?: string;
  category: string;
  demo?: boolean;
  apiKey?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Suggestion[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Fetch AI suggestions on first flip (non-demo only)
  useEffect(() => {
    if (!flipped || demo || !apiKey || aiSuggestions !== null) return;
    setAiLoading(true);
    apiFetch<{ suggestions: Suggestion[] }>(
      `/v1/pipelines/${pipeline.pipeline_id}/suggestions`,
      apiKey,
    )
      .then((d) => {
        const filtered = d.suggestions.filter((s) => s.category === category || !s.category);
        setAiSuggestions(filtered.length > 0 ? filtered : d.suggestions.slice(0, 2));
      })
      .catch(() => setAiSuggestions(null))
      .finally(() => setAiLoading(false));
  }, [flipped, demo, apiKey, pipeline.pipeline_id, category, aiSuggestions]);

  const suggestions = aiSuggestions ?? getSuggestions(pipeline.metrics, category);

  const p = {
    pink: { border: "border-pink/30", text: "text-pink", soft: "text-pink-soft", bg: "bg-pink/[0.04]" },
    electric: { border: "border-electric/30", text: "text-electric", soft: "text-electric-soft", bg: "bg-electric/[0.04]" },
    mint: { border: "border-mint/30", text: "text-mint", soft: "text-mint-soft", bg: "bg-mint/[0.04]" },
    lavender: { border: "border-lavender/30", text: "text-lavender", soft: "text-lavender", bg: "bg-lavender/[0.04]" },
  }[color];

  const diffStyle = {
    easy: "bg-mint/10 text-mint border-mint/20",
    medium: "bg-amber/10 text-amber border-amber/20",
    hard: "bg-coral/10 text-coral border-coral/20",
  };

  return (
    <div className="cursor-pointer" style={{ perspective: "1200px" }}>
      <div className="relative transition-transform duration-500" style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "none" }}>
        {/* Front */}
        <div
          className={`card ${p.border} ${p.bg} p-6`}
          style={{ backfaceVisibility: "hidden", display: flipped ? "none" : "block" }}
          onClick={() => setFlipped(true)}
        >
          <p className={`text-[11px] font-bold ${p.text} uppercase tracking-widest mb-4`}>{label}</p>
          <p className="text-base font-bold text-text-bright mb-1">{pipeline.pipeline_id}</p>
          <p className={`text-5xl font-black tracking-tight ${p.text}`}>{value}</p>
          {subtitle && <p className="text-text-faint text-sm mt-2">{subtitle}</p>}
          <p className="text-text-faint text-xs mt-5 animate-pulse-soft">Click for power-ups &#8594;</p>
        </div>

        {/* Back */}
        <div
          className={`card ${p.border} p-5`}
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", display: flipped ? "block" : "none" }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className={`text-[11px] font-bold ${p.text} uppercase tracking-wider`}>Power-ups for {pipeline.pipeline_id}</p>
            <button onClick={(e) => { e.stopPropagation(); setFlipped(false); }} className={`text-xs font-bold ${p.text} hover:opacity-70`}>&#8592; Back</button>
          </div>
          {aiLoading && (
            <div className="flex items-center gap-3 mb-4 p-3 card-inset rounded-xl">
              <div className="w-4 h-4 border-2 border-pink/40 border-t-pink rounded-full animate-spin" />
              <p className="text-xs text-text-muted">AI is analyzing your pipeline...</p>
            </div>
          )}
          {!demo && aiSuggestions && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[9px] font-bold text-pink uppercase tracking-wider">AI-Powered</span>
              <span className="w-1.5 h-1.5 rounded-full bg-pink animate-pulse-soft" />
            </div>
          )}
          <div className="space-y-4 max-h-[520px] overflow-y-auto">
            {suggestions.map((tip, i) => (
              <div key={i} className="card-raised p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className={`text-sm font-bold ${p.soft}`}>{tip.title}</h4>
                  <span className={`pill ${diffStyle[tip.difficulty]} text-[9px] shrink-0`}>{tip.difficulty}</span>
                </div>
                <p className="text-text-muted text-sm leading-relaxed mb-2">{tip.description}</p>
                {tip.code && (
                  <div className="relative mt-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(tip.code!); setCopied(i); setTimeout(() => setCopied(null), 2000); }}
                      className={`absolute top-2 right-2 text-[10px] font-bold ${p.text} hover:opacity-70`}
                    >
                      {copied === i ? "Copied!" : "Copy"}
                    </button>
                    <pre className="card-inset p-3 text-xs font-mono text-text-muted overflow-x-auto whitespace-pre">{tip.code}</pre>
                  </div>
                )}
                <p className="text-xs mt-3">
                  <span className={`font-bold ${p.text}`}>Impact:</span>{" "}
                  <span className="text-text-normal">{tip.impact}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── SETUP TAB ─── */

function SetupTab({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const copy = (text: string, id: string) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); };

  const autoSnippet = `from raibench import monitor, patch

monitor.init(
    api_key="${apiKey}",
    pipeline="my-app",
    api_url="https://raibench-api.fly.dev",
)
patch()

# That's it! Every OpenAI & Anthropic call is now traced.
# Just use the SDKs normally — no decorators needed.`;

  const manualSnippet = `from raibench import monitor

monitor.init(
    api_key="${apiKey}",
    pipeline="my-rag-bot",
    category="support-qa",
    api_url="https://raibench-api.fly.dev",
)

@monitor.trace(stage="retrieval", provider="pinecone")
async def search_docs(query: str):
    return await vector_db.search(query, top_k=5)

@monitor.trace(stage="generation", provider="openai", model="gpt-4o")
async def generate_answer(query: str, context: list):
    return await openai.chat.completions.create(...)`;

  const snippet = mode === "auto" ? autoSnippet : manualSnippet;

  const steps = [
    {
      num: "1",
      color: "pink" as const,
      title: "Install the SDK",
      desc: "One command. That's it.",
      content: (
        <div className="flex items-center gap-3">
          <code className="flex-1 card-inset text-pink px-4 py-3 font-mono text-sm">pip install raibench</code>
          <button onClick={() => copy("pip install raibench", "pip")} className="btn btn-pink">{copied === "pip" ? "Done!" : "Copy"}</button>
        </div>
      ),
    },
    {
      num: "2",
      color: "electric" as const,
      title: mode === "auto" ? "Add 3 lines to your app" : "Drop this in your code",
      desc: mode === "auto"
        ? <>Auto-patch detects OpenAI &amp; Anthropic and traces every call. <strong className="text-electric-soft">Zero decorators.</strong></>
        : <>Add <code className="text-electric-soft font-mono text-sm">@monitor.trace</code> to any function for full control.</>,
      content: (
        <div>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setMode("auto")} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${mode === "auto" ? "bg-pink/15 text-pink border border-pink/30" : "text-text-faint border border-border-subtle hover:text-pink"}`}>Auto-Patch (easy)</button>
            <button onClick={() => setMode("manual")} className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${mode === "manual" ? "bg-electric/15 text-electric-soft border border-electric/30" : "text-text-faint border border-border-subtle hover:text-electric-soft"}`}>Manual (full control)</button>
          </div>
          <div className="relative">
            <button onClick={() => copy(snippet, "snippet")} className="absolute top-3 right-3 btn btn-electric" style={{ fontSize: 10, padding: "5px 12px" }}>{copied === "snippet" ? "Done!" : "Copy"}</button>
            <pre className="card-inset text-text-muted px-4 py-4 font-mono text-xs overflow-x-auto whitespace-pre">{snippet}</pre>
          </div>
        </div>
      ),
    },
    {
      num: "3",
      color: "mint" as const,
      title: "Watch it light up",
      desc: "Run your app, then hit the Metrics tab. Your pipelines will appear automatically.",
      content: null,
    },
  ];

  const orbColors = { pink: "border-pink text-pink", electric: "border-electric text-electric-soft", mint: "border-mint text-mint" };
  const borderColors = { pink: "border-pink/20", electric: "border-electric/20", mint: "border-mint/20" };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center mb-2">
        <h3 className="text-2xl font-black text-text-bright mb-1">Ready to play?</h3>
        <p className="text-text-muted">Three steps. Two minutes. Zero config files.</p>
      </div>

      {steps.map((s) => (
        <div key={s.num} className={`card ${borderColors[s.color]} p-6`}>
          <div className="flex items-center gap-4 mb-3">
            <div className={`orb ${orbColors[s.color]} text-sm`}>{s.num}</div>
            <div>
              <h4 className="text-base font-bold text-text-bright">{s.title}</h4>
              <p className="text-sm text-text-muted">{s.desc}</p>
            </div>
          </div>
          {s.content}
        </div>
      ))}

      <div className="card border-lavender/20 p-5 text-center">
        <p className="text-[11px] font-bold text-lavender uppercase tracking-wider mb-2">Your Player Key</p>
        <div className="flex items-center justify-center gap-3">
          <code className="card-inset text-lavender px-5 py-2 font-mono">{apiKey}</code>
          <button onClick={() => copy(apiKey, "key")} className="btn" style={{ borderColor: "#b48eff", color: "#b48eff" }}>{copied === "key" ? "Done!" : "Copy"}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── METRICS TAB ─── */

function MetricsTab({ pipelines, apiKey, demo }: { pipelines: Pipeline[]; apiKey: string; demo?: boolean }) {
  const [sel, setSel] = useState(pipelines[0]?.pipeline_id || "");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [ts, setTs] = useState<Bucket[]>([]);
  const [period, setPeriod] = useState("24h");

  useEffect(() => {
    if (!sel) return;
    if (demo) {
      setMetrics(DEMO_METRICS[sel] || null);
      setTs(DEMO_TIMESERIES[sel] || []);
      return;
    }
    if (!apiKey) return;
    apiFetch<Metrics>(`/v1/pipelines/${sel}/metrics?period=${period}`, apiKey).then(setMetrics);
    apiFetch<{ buckets: Bucket[] }>(`/v1/pipelines/${sel}/timeseries?period=${period}&bucket=1h`, apiKey).then((d) => setTs(d.buckets));
  }, [sel, period, apiKey, demo]);

  if (!pipelines.length) return (
    <div className="text-center py-20">
      <p className="text-lg font-bold text-pink animate-pulse-soft">Waiting for players...</p>
      <p className="text-text-muted mt-2">Install the SDK and fire some events to see metrics.</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="bg-bg-surface border border-border-subtle text-text-bright rounded-xl px-4 py-2 font-semibold text-sm focus:outline-none focus:border-pink">
          {pipelines.map((p) => <option key={p.pipeline_id} value={p.pipeline_id}>{p.pipeline_id}</option>)}
        </select>
        <div className="flex gap-2">
          {["1h", "24h", "7d", "30d"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${period === p ? "bg-pink/15 text-pink border border-pink/30" : "text-text-faint border border-border-subtle hover:text-pink hover:border-pink/20"}`}>{p}</button>
          ))}
        </div>
      </div>
      {metrics && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Events" value={metrics.total_events.toLocaleString()} color="pink" />
            <MetricCard label="Success Rate" value={`${Math.round(metrics.success_rate * 100)}%`} color="mint" />
            <MetricCard label="p50 Latency" value={metrics.p50_latency_ms ? `${metrics.p50_latency_ms}ms` : "\u2014"} color="electric" />
            <MetricCard label="Total Cost" value={`$${(metrics.total_cost_cents / 100).toFixed(2)}`} color="amber" />
          </div>
          <div className="grid grid-cols-1 gap-6">
            <SuccessRateChart data={ts} />
            <LatencyChart data={ts} />
            <CostChart data={ts} />
          </div>
          {!demo && <ActivityFeed pipelineId={sel} apiKey={apiKey} />}
        </>
      )}
    </div>
  );
}

/* ─── ACTIVITY FEED ─── */

interface RecentEvent {
  pipeline_id: string; stage: string; provider: string | null; model: string | null;
  latency_ms: number; token_count: number | null; cost_cents: number | null;
  success: boolean; created_at: string;
}

function ActivityFeed({ pipelineId, apiKey }: { pipelineId: string; apiKey: string }) {
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ events: RecentEvent[] }>(`/v1/pipelines/${pipelineId}/events/recent?limit=20`, apiKey)
      .then((d) => setEvents(d.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pipelineId, apiKey]);

  if (loading) return <div className="h-20 card animate-shimmer rounded-xl mt-6" />;
  if (!events.length) return null;

  return (
    <div className="mt-8">
      <h3 className="text-sm font-black text-text-bright uppercase tracking-wider mb-4">Live Activity</h3>
      <div className="card border-border-subtle overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto">
          {events.map((e, i) => {
            const ago = _timeAgo(e.created_at);
            return (
              <div key={i} className={`flex items-center gap-4 px-4 py-2.5 text-xs border-b border-border-subtle/50 ${!e.success ? "bg-coral/[0.03]" : i % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.success ? "bg-mint" : "bg-coral"}`} />
                <span className="text-text-faint w-16 shrink-0">{ago}</span>
                <span className="text-text-muted w-20 shrink-0">{e.model || e.provider || e.stage}</span>
                <span className="text-electric-soft font-mono">{e.latency_ms}ms</span>
                {e.cost_cents != null && <span className="text-amber font-mono">{e.cost_cents.toFixed(2)}¢</span>}
                {e.token_count != null && <span className="text-text-faint">{e.token_count} tok</span>}
                <span className={`ml-auto font-bold ${e.success ? "text-mint" : "text-coral"}`}>{e.success ? "OK" : "FAIL"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function _timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

/* ─── PIPELINES TAB ─── */

function PipelinesTab({ pipelines, apiKey, demo }: { pipelines: Pipeline[]; apiKey: string; demo?: boolean }) {
  const [all, setAll] = useState<Record<string, Metrics>>({});

  useEffect(() => {
    if (demo) { setAll(DEMO_METRICS); return; }
    if (!apiKey || !pipelines.length) return;
    pipelines.forEach((p) => apiFetch<Metrics>(`/v1/pipelines/${p.pipeline_id}/metrics?period=30d`, apiKey).then((m) => setAll((prev) => ({ ...prev, [p.pipeline_id]: m }))));
  }, [pipelines, apiKey, demo]);

  if (!pipelines.length) return (
    <div className="text-center py-20">
      <p className="text-lg font-bold text-pink animate-pulse-soft">No players yet</p>
      <p className="text-text-muted mt-2">Install the SDK to register your first pipeline.</p>
    </div>
  );

  const ranked = pipelines.filter((p) => all[p.pipeline_id]).map((p) => ({ ...p, metrics: all[p.pipeline_id] })).sort((a, b) => b.metrics.success_rate - a.metrics.success_rate);
  const best = ranked[0];
  const fast = [...ranked].sort((a, b) => (a.metrics.p50_latency_ms ?? Infinity) - (b.metrics.p50_latency_ms ?? Infinity))[0];
  const cheap = [...ranked].sort((a, b) => a.metrics.total_cost_cents - b.metrics.total_cost_cents)[0];

  const trophyCards = [
    best && { label: "Top Accuracy", color: "border-mint/25 bg-mint/[0.03]", labelColor: "text-mint", name: best.pipeline_id, val: `${Math.round(best.metrics.success_rate * 100)}%`, valColor: "text-mint" },
    fast?.metrics.p50_latency_ms && { label: "Speed Demon", color: "border-electric/25 bg-electric/[0.03]", labelColor: "text-electric-soft", name: fast.pipeline_id, val: `${fast.metrics.p50_latency_ms}ms`, valColor: "text-electric-soft" },
    cheap && { label: "Budget King", color: "border-amber/25 bg-amber/[0.03]", labelColor: "text-amber", name: cheap.pipeline_id, val: `$${(cheap.metrics.total_cost_cents / 100).toFixed(2)}`, valColor: "text-amber" },
  ].filter(Boolean) as { label: string; color: string; labelColor: string; name: string; val: string; valColor: string }[];

  const rankColors = ["border-pink/30 bg-pink/[0.02]", "border-electric/20", "border-amber/20"];
  const orbColors = ["border-pink text-pink", "border-electric text-electric-soft", "border-amber text-amber"];

  return (
    <div>
      {trophyCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {trophyCards.map((t) => (
            <div key={t.label} className={`card ${t.color} p-4`}>
              <p className={`text-[10px] font-bold ${t.labelColor} uppercase tracking-wider mb-2`}>{t.label}</p>
              <p className="text-sm font-bold text-text-bright">{t.name}</p>
              <p className={`text-2xl font-black ${t.valColor}`}>{t.val}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {ranked.map((p, i) => (
          <div key={p.pipeline_id} className={`card ${rankColors[i] || "border-border-subtle"} p-5 transition-all hover:scale-[1.003]`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`orb ${orbColors[i] || "border-text-faint text-text-faint"} text-sm`}>{i + 1}</div>
                <div>
                  <Link href={`/dashboard/${p.pipeline_id}`} className="font-bold text-text-bright hover:text-pink transition-colors">{p.pipeline_id}</Link>
                  <p className="text-text-faint text-sm">{p.event_count.toLocaleString()} events &middot; {new Date(p.last_event).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-8 font-bold">
                <div className="text-right">
                  <p className="text-[10px] text-text-faint uppercase">Hit%</p>
                  <p className={p.metrics.success_rate >= 0.95 ? "text-mint" : p.metrics.success_rate >= 0.8 ? "text-amber" : "text-coral"}>{Math.round(p.metrics.success_rate * 100)}%</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-text-faint uppercase">Speed</p>
                  <p className="text-electric-soft">{p.metrics.p50_latency_ms ? `${p.metrics.p50_latency_ms}ms` : "\u2014"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-text-faint uppercase">Cost</p>
                  <p className="text-amber">${(p.metrics.total_cost_cents / 100).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── LEADERBOARD TAB ─── */

function LeaderboardTab({ pipelines, apiKey, demo }: { pipelines: Pipeline[]; apiKey: string; demo?: boolean }) {
  const [all, setAll] = useState<Record<string, Metrics>>({});

  useEffect(() => {
    if (demo) { setAll(DEMO_METRICS); return; }
    if (!apiKey || !pipelines.length) return;
    pipelines.forEach((p) => apiFetch<Metrics>(`/v1/pipelines/${p.pipeline_id}/metrics?period=30d`, apiKey).then((m) => setAll((prev) => ({ ...prev, [p.pipeline_id]: m }))));
  }, [pipelines, apiKey, demo]);

  if (!pipelines.length) return (
    <div className="text-center py-20">
      <p className="text-lg font-bold text-pink animate-pulse-soft">No high scores yet</p>
      <p className="text-text-muted mt-2">Add pipelines to unlock the leaderboard.</p>
    </div>
  );

  const ranked: PipelineWithMetrics[] = pipelines.filter((p) => all[p.pipeline_id]).map((p) => ({ ...p, metrics: all[p.pipeline_id] }));
  if (!ranked.length) return <div className="h-40 card animate-shimmer rounded-2xl" />;

  const bySuccess = [...ranked].sort((a, b) => b.metrics.success_rate - a.metrics.success_rate);
  const bySpeed = [...ranked].sort((a, b) => (a.metrics.p50_latency_ms ?? Infinity) - (b.metrics.p50_latency_ms ?? Infinity));
  const byCost = [...ranked].sort((a, b) => {
    const ac = a.metrics.total_events > 0 ? a.metrics.total_cost_cents / a.metrics.total_events : Infinity;
    const bc = b.metrics.total_events > 0 ? b.metrics.total_cost_cents / b.metrics.total_events : Infinity;
    return ac - bc;
  });
  const byVol = [...ranked].sort((a, b) => b.metrics.total_events - a.metrics.total_events);

  return (
    <div>
      <div className="text-center mb-10">
        <h3 className="text-2xl font-black text-text-bright mb-1">High Scores</h3>
        <p className="text-text-muted">Your top pipelines. Click any card for copy-paste optimization code.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <FlippableCard label="Most Reliable" color="mint" pipeline={bySuccess[0]} value={`${Math.round(bySuccess[0].metrics.success_rate * 100)}%`} subtitle={`${bySuccess[0].metrics.total_events.toLocaleString()} events`} category="success" demo={demo} apiKey={apiKey} />
        <FlippableCard label="Speed Champion" color="electric" pipeline={bySpeed[0]} value={bySpeed[0].metrics.p50_latency_ms ? `${bySpeed[0].metrics.p50_latency_ms}ms` : "\u2014"} subtitle="p50 latency" category="latency" demo={demo} apiKey={apiKey} />
        <FlippableCard label="Cost Efficient" color="pink" pipeline={byCost[0]} value={byCost[0].metrics.total_events > 0 ? `${(byCost[0].metrics.total_cost_cents / byCost[0].metrics.total_events).toFixed(2)}\u00A2` : "\u2014"} subtitle="per event" category="cost" demo={demo} apiKey={apiKey} />
        <FlippableCard label="Volume King" color="lavender" pipeline={byVol[0]} value={byVol[0].metrics.total_events.toLocaleString()} subtitle="total events" category="volume" demo={demo} apiKey={apiKey} />
      </div>

      {/* Rankings table */}
      <div className="card border-pink/15 overflow-hidden">
        <div className="p-4 border-b border-border-subtle">
          <h4 className="text-sm font-black text-pink uppercase tracking-wider">Full Rankings</h4>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              {["Rank", "Pipeline", "Hit%", "Speed", "$/Event", "Events"].map((h, i) => (
                <th key={h} className={`${i < 2 ? "text-left" : "text-right"} px-5 py-3 text-[10px] font-bold text-text-faint uppercase tracking-wider`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bySuccess.map((p, i) => {
              const cpe = p.metrics.total_events > 0 ? p.metrics.total_cost_cents / p.metrics.total_events : 0;
              return (
                <tr key={p.pipeline_id} className={`border-b border-border-subtle/50 hover:bg-white/[0.015] transition-colors ${i === 0 ? "bg-pink/[0.02]" : ""}`}>
                  <td className={`px-5 py-4 font-black ${i === 0 ? "text-pink" : i === 1 ? "text-electric-soft" : i === 2 ? "text-amber" : "text-text-faint"}`}>
                    {i === 0 ? "\u{1F451}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : `#${i + 1}`}
                  </td>
                  <td className="px-5 py-4 font-bold text-text-bright">{p.pipeline_id}</td>
                  <td className="px-5 py-4 text-right">
                    <span className={`font-bold ${p.metrics.success_rate >= 0.95 ? "text-mint" : p.metrics.success_rate >= 0.8 ? "text-amber" : "text-coral"}`}>{Math.round(p.metrics.success_rate * 100)}%</span>
                  </td>
                  <td className="px-5 py-4 text-right text-electric-soft">{p.metrics.p50_latency_ms ? `${p.metrics.p50_latency_ms}ms` : "\u2014"}</td>
                  <td className="px-5 py-4 text-right text-amber">{cpe.toFixed(2)}\u00A2</td>
                  <td className="px-5 py-4 text-right text-text-faint">{p.metrics.total_events.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── MAIN ─── */

/* ─── ALERTS TAB ─── */

interface AlertRule { id: string; pipeline_id: string; webhook_url: string; channel: string; metric: string; operator: string; threshold: number; enabled: boolean; }

function AlertsTab({ pipelines, apiKey, demo }: { pipelines: Pipeline[]; apiKey: string; demo?: boolean }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    pipeline_id: pipelines[0]?.pipeline_id || "",
    webhook_url: "",
    channel: "slack",
    metric: "success_rate",
    operator: "lt",
    threshold: "0.9",
  });

  const badgeBase = `https://raibench-api.fly.dev/badge/${apiKey}`;

  useEffect(() => {
    if (demo) { setLoading(false); return; }
    apiFetch<{ rules: AlertRule[] }>("/v1/alerts", apiKey)
      .then((d) => setRules(d.rules))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiKey, demo]);

  const handleCreate = async () => {
    try {
      const res = await apiFetch<{ rule: AlertRule }>("/v1/alerts", apiKey, {
        method: "POST",
        body: JSON.stringify({ ...form, threshold: parseFloat(form.threshold) }),
      });
      setRules((prev) => [...prev, res.rule]);
      setShowForm(false);
      setForm((f) => ({ ...f, webhook_url: "", threshold: "0.9" }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/v1/alerts/${id}`, apiKey, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await apiFetch(`/v1/alerts/test?webhook_url=${encodeURIComponent(form.webhook_url)}&channel=${form.channel}`, apiKey, { method: "POST" });
      setTestResult("sent");
    } catch {
      setTestResult("failed");
    }
    setTesting(false);
  };

  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, id: string) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); };

  const metricLabels: Record<string, string> = {
    success_rate: "Success Rate",
    p50_latency_ms: "p50 Latency (ms)",
    daily_cost_cents: "Daily Cost (cents)",
  };

  const operatorLabels: Record<string, string> = { lt: "drops below", gt: "exceeds" };

  if (demo) {
    return (
      <div className="text-center py-20">
        <p className="text-lg font-bold text-pink animate-pulse-soft">Alerts require a live connection</p>
        <p className="text-text-muted mt-2">Connect your API key to set up Slack/Discord alerts.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Alerts section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-black text-text-bright">Alert Rules</h3>
            <p className="text-text-muted text-sm">Get notified in Slack or Discord when metrics cross your thresholds.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-pink text-xs">{showForm ? "Cancel" : "+ New Alert"}</button>
        </div>

        {showForm && (
          <div className="card border-pink/20 p-5 mb-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-text-faint uppercase tracking-wider block mb-1">Pipeline</label>
                <select value={form.pipeline_id} onChange={(e) => setForm({ ...form, pipeline_id: e.target.value })} className="w-full bg-bg-surface border border-border-subtle text-text-bright rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-pink">
                  {pipelines.map((p) => <option key={p.pipeline_id} value={p.pipeline_id}>{p.pipeline_id}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-text-faint uppercase tracking-wider block mb-1">Channel</label>
                <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="w-full bg-bg-surface border border-border-subtle text-text-bright rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-pink">
                  <option value="slack">Slack</option>
                  <option value="discord">Discord</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-text-faint uppercase tracking-wider block mb-1">Webhook URL</label>
              <div className="flex gap-2">
                <input value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} placeholder="https://hooks.slack.com/services/..." className="flex-1 bg-bg-surface border border-border-subtle text-text-bright rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-pink placeholder:text-text-faint" />
                {form.webhook_url && (
                  <button onClick={handleTest} disabled={testing} className="btn text-[10px] px-3" style={{ borderColor: "#7dd3fc", color: "#7dd3fc" }}>
                    {testing ? "..." : testResult === "sent" ? "Sent!" : testResult === "failed" ? "Failed" : "Test"}
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-bold text-text-faint uppercase tracking-wider block mb-1">Metric</label>
                <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} className="w-full bg-bg-surface border border-border-subtle text-text-bright rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-pink">
                  <option value="success_rate">Success Rate</option>
                  <option value="p50_latency_ms">p50 Latency</option>
                  <option value="daily_cost_cents">Daily Cost</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-text-faint uppercase tracking-wider block mb-1">When it...</label>
                <select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} className="w-full bg-bg-surface border border-border-subtle text-text-bright rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-pink">
                  <option value="lt">Drops below</option>
                  <option value="gt">Exceeds</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-text-faint uppercase tracking-wider block mb-1">Threshold</label>
                <input value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} className="w-full bg-bg-surface border border-border-subtle text-text-bright rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-pink" />
              </div>
            </div>
            <button onClick={handleCreate} className="btn btn-pink text-xs w-full py-3">Create Alert Rule</button>
          </div>
        )}

        {loading ? (
          <div className="h-20 card animate-shimmer rounded-xl" />
        ) : rules.length === 0 ? (
          <div className="card border-border-subtle p-8 text-center">
            <p className="text-text-faint">No alert rules yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="card border-border-subtle p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className={`pill text-[9px] ${r.channel === "slack" ? "bg-electric/10 text-electric-soft border-electric/20" : "bg-lavender/10 text-lavender border-lavender/20"}`}>{r.channel}</span>
                  <div>
                    <p className="text-sm font-bold text-text-bright">{r.pipeline_id}</p>
                    <p className="text-xs text-text-muted">
                      Alert when <span className="text-pink font-bold">{metricLabels[r.metric] || r.metric}</span> {operatorLabels[r.operator] || r.operator} <span className="font-mono text-text-bright">{r.threshold}</span>
                    </p>
                  </div>
                </div>
                <button onClick={() => handleDelete(r.id)} className="text-text-faint hover:text-coral text-xs font-bold transition-colors">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Badges section */}
      <div>
        <h3 className="text-xl font-black text-text-bright mb-1">Pipeline Badges</h3>
        <p className="text-text-muted text-sm mb-4">Embed live status badges in your README. Updates every 5 minutes.</p>

        {pipelines.length === 0 ? (
          <div className="card border-border-subtle p-8 text-center">
            <p className="text-text-faint">Add pipelines to generate badges.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pipelines.map((p) => {
              const statusUrl = `${badgeBase}/${p.pipeline_id}?metric=status`;
              const successUrl = `${badgeBase}/${p.pipeline_id}?metric=success_rate`;
              const latencyUrl = `${badgeBase}/${p.pipeline_id}?metric=latency`;
              const md = `![${p.pipeline_id} status](${statusUrl})`;

              return (
                <div key={p.pipeline_id} className="card border-border-subtle p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-text-bright">{p.pipeline_id}</p>
                    <div className="flex gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={statusUrl} alt="status" height={20} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={successUrl} alt="success rate" height={20} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={latencyUrl} alt="latency" height={20} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 card-inset text-text-muted px-3 py-2 text-xs font-mono overflow-x-auto">{md}</code>
                    <button onClick={() => copy(md, p.pipeline_id)} className="btn btn-pink text-[10px] px-3 shrink-0">{copied === p.pipeline_id ? "Done!" : "Copy"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── COMPARE TAB ─── */

function CompareTab({ pipelines, apiKey, demo }: { pipelines: Pipeline[]; apiKey: string; demo?: boolean }) {
  const [left, setLeft] = useState(pipelines[0]?.pipeline_id || "");
  const [right, setRight] = useState(pipelines[1]?.pipeline_id || pipelines[0]?.pipeline_id || "");
  const [leftMetrics, setLeftMetrics] = useState<Metrics | null>(null);
  const [rightMetrics, setRightMetrics] = useState<Metrics | null>(null);
  const [leftTs, setLeftTs] = useState<Bucket[]>([]);
  const [rightTs, setRightTs] = useState<Bucket[]>([]);
  const [period, setPeriod] = useState("24h");

  useEffect(() => {
    if (demo) {
      setLeftMetrics(DEMO_METRICS[left] || null);
      setRightMetrics(DEMO_METRICS[right] || null);
      setLeftTs(DEMO_TIMESERIES[left] || []);
      setRightTs(DEMO_TIMESERIES[right] || []);
      return;
    }
    if (!apiKey) return;
    apiFetch<Metrics>(`/v1/pipelines/${left}/metrics?period=${period}`, apiKey).then(setLeftMetrics);
    apiFetch<Metrics>(`/v1/pipelines/${right}/metrics?period=${period}`, apiKey).then(setRightMetrics);
    apiFetch<{ buckets: Bucket[] }>(`/v1/pipelines/${left}/timeseries?period=${period}&bucket=1h`, apiKey).then((d) => setLeftTs(d.buckets));
    apiFetch<{ buckets: Bucket[] }>(`/v1/pipelines/${right}/timeseries?period=${period}&bucket=1h`, apiKey).then((d) => setRightTs(d.buckets));
  }, [left, right, period, apiKey, demo]);

  if (pipelines.length < 2) {
    return (
      <div className="text-center py-20">
        <p className="text-lg font-bold text-pink animate-pulse-soft">Need at least 2 pipelines</p>
        <p className="text-text-muted mt-2">Add more pipelines to compare them side by side.</p>
      </div>
    );
  }

  const rows = [
    { label: "Events", key: "total_events", fmt: (v: number) => v.toLocaleString(), color: "text-pink" },
    { label: "Success Rate", key: "success_rate", fmt: (v: number) => `${Math.round(v * 100)}%`, color: "text-mint", better: "higher" as const },
    { label: "p50 Latency", key: "p50_latency_ms", fmt: (v: number | null) => v ? `${v}ms` : "\u2014", color: "text-electric-soft", better: "lower" as const },
    { label: "p95 Latency", key: "p95_latency_ms", fmt: (v: number | null) => v ? `${v}ms` : "\u2014", color: "text-electric-soft", better: "lower" as const },
    { label: "Total Cost", key: "total_cost_cents", fmt: (v: number) => `$${(v / 100).toFixed(2)}`, color: "text-amber", better: "lower" as const },
    { label: "Cost/Event", key: "_cpe", fmt: (v: number) => `${v.toFixed(2)}¢`, color: "text-amber", better: "lower" as const },
  ];

  const getCpe = (m: Metrics | null) => m && m.total_events > 0 ? m.total_cost_cents / m.total_events : 0;
  const getVal = (m: Metrics | null, key: string) => {
    if (!m) return null;
    if (key === "_cpe") return getCpe(m);
    return (m as unknown as Record<string, number | null>)[key] ?? null;
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <select value={left} onChange={(e) => setLeft(e.target.value)} className="bg-bg-surface border border-pink/30 text-pink rounded-xl px-4 py-2 font-semibold text-sm focus:outline-none">
          {pipelines.map((p) => <option key={p.pipeline_id} value={p.pipeline_id}>{p.pipeline_id}</option>)}
        </select>
        <span className="text-text-faint font-bold text-sm">vs</span>
        <select value={right} onChange={(e) => setRight(e.target.value)} className="bg-bg-surface border border-electric/30 text-electric-soft rounded-xl px-4 py-2 font-semibold text-sm focus:outline-none">
          {pipelines.map((p) => <option key={p.pipeline_id} value={p.pipeline_id}>{p.pipeline_id}</option>)}
        </select>
        <div className="flex gap-2 ml-auto">
          {["1h", "24h", "7d", "30d"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${period === p ? "bg-pink/15 text-pink border border-pink/30" : "text-text-faint border border-border-subtle hover:text-pink hover:border-pink/20"}`}>{p}</button>
          ))}
        </div>
      </div>

      {leftMetrics && rightMetrics && (
        <>
          <div className="card border-border-subtle overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-text-faint uppercase tracking-wider">Metric</th>
                  <th className="text-center px-5 py-3 text-[10px] font-bold text-pink uppercase tracking-wider">{left}</th>
                  <th className="text-center px-5 py-3 text-[10px] font-bold text-electric-soft uppercase tracking-wider">{right}</th>
                  <th className="text-center px-5 py-3 text-[10px] font-bold text-text-faint uppercase tracking-wider">Winner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lv = getVal(leftMetrics, r.key);
                  const rv = getVal(rightMetrics, r.key);
                  let winner = "";
                  if (lv != null && rv != null && r.better) {
                    if (r.better === "higher") winner = lv > rv ? left : lv < rv ? right : "tie";
                    else winner = lv < rv ? left : lv > rv ? right : "tie";
                  }
                  return (
                    <tr key={r.key} className="border-b border-border-subtle/50">
                      <td className="px-5 py-3 font-bold text-text-bright">{r.label}</td>
                      <td className={`px-5 py-3 text-center font-bold ${winner === left ? "text-mint" : r.color}`}>{lv != null ? r.fmt(lv as never) : "\u2014"}</td>
                      <td className={`px-5 py-3 text-center font-bold ${winner === right ? "text-mint" : r.color}`}>{rv != null ? r.fmt(rv as never) : "\u2014"}</td>
                      <td className="px-5 py-3 text-center text-xs font-bold">
                        {winner === left ? <span className="text-pink">{left}</span> : winner === right ? <span className="text-electric-soft">{right}</span> : winner === "tie" ? <span className="text-text-faint">Tie</span> : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-pink uppercase tracking-wider mb-2">{left} — Success Rate</p>
              <SuccessRateChart data={leftTs} />
            </div>
            <div>
              <p className="text-xs font-bold text-electric-soft uppercase tracking-wider mb-2">{right} — Success Rate</p>
              <SuccessRateChart data={rightTs} />
            </div>
            <div>
              <p className="text-xs font-bold text-pink uppercase tracking-wider mb-2">{left} — Latency</p>
              <LatencyChart data={leftTs} />
            </div>
            <div>
              <p className="text-xs font-bold text-electric-soft uppercase tracking-wider mb-2">{right} — Latency</p>
              <LatencyChart data={rightTs} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── DIGEST TAB ─── */

interface DigestData {
  this_week: { events: number; success_rate: number; cost_cents: number };
  last_week: { events: number; success_rate: number; cost_cents: number };
  changes: { events_delta: number; success_delta: number; cost_delta: number };
  pipelines: { pipeline_id: string; events: number; success_rate: number; p50_latency_ms: number | null; cost_cents: number }[];
}

function DigestTab({ apiKey, demo }: { apiKey: string; demo?: boolean }) {
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (demo) {
      setDigest({
        this_week: { events: 26405, success_rate: 0.952, cost_cents: 17099 },
        last_week: { events: 24100, success_rate: 0.941, cost_cents: 18340 },
        changes: { events_delta: 2305, success_delta: 0.011, cost_delta: -1241 },
        pipelines: [
          { pipeline_id: "support-bot", events: 12847, success_rate: 0.974, p50_latency_ms: 420, cost_cents: 3841 },
          { pipeline_id: "product-search", events: 8503, success_rate: 0.962, p50_latency_ms: 180, cost_cents: 1275 },
          { pipeline_id: "legal-qa", events: 3291, success_rate: 0.891, p50_latency_ms: 2340, cost_cents: 4927 },
          { pipeline_id: "code-reviewer", events: 1764, success_rate: 0.847, p50_latency_ms: 3800, cost_cents: 7056 },
        ],
      });
      setLoading(false);
      return;
    }
    apiFetch<DigestData>("/v1/digest", apiKey)
      .then(setDigest)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiKey, demo]);

  if (loading) return <div className="h-40 card animate-shimmer rounded-2xl" />;
  if (!digest) return <div className="text-center py-20 text-text-faint">No data available.</div>;

  const tw = digest.this_week;
  const ch = digest.changes;

  const delta = (val: number, invert?: boolean) => {
    const positive = invert ? val < 0 : val > 0;
    const sign = val > 0 ? "+" : "";
    return <span className={`font-bold ${positive ? "text-mint" : val === 0 ? "text-text-faint" : "text-coral"}`}>{sign}{typeof val === "number" && Math.abs(val) < 1 ? (val * 100).toFixed(1) + "%" : val.toLocaleString()}</span>;
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <h3 className="text-2xl font-black text-text-bright mb-1">Weekly Digest</h3>
        <p className="text-text-muted">Your pipeline performance over the last 7 days.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card border-pink/20 p-5 text-center">
          <p className="text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">Events</p>
          <p className="text-3xl font-black text-pink">{tw.events.toLocaleString()}</p>
          <p className="text-xs mt-1">{delta(ch.events_delta)} vs last week</p>
        </div>
        <div className="card border-mint/20 p-5 text-center">
          <p className="text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">Success Rate</p>
          <p className="text-3xl font-black text-mint">{Math.round(tw.success_rate * 100)}%</p>
          <p className="text-xs mt-1">{delta(ch.success_delta)} vs last week</p>
        </div>
        <div className="card border-amber/20 p-5 text-center">
          <p className="text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">Cost</p>
          <p className="text-3xl font-black text-amber">${(tw.cost_cents / 100).toFixed(2)}</p>
          <p className="text-xs mt-1">{delta(ch.cost_delta / 100, true)} vs last week</p>
        </div>
      </div>

      {/* Pipeline breakdown */}
      <div className="card border-border-subtle overflow-hidden">
        <div className="p-4 border-b border-border-subtle">
          <h4 className="text-sm font-black text-text-bright uppercase tracking-wider">Pipeline Breakdown</h4>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              {["Pipeline", "Events", "Hit%", "p50", "Cost"].map((h, i) => (
                <th key={h} className={`${i === 0 ? "text-left" : "text-right"} px-5 py-3 text-[10px] font-bold text-text-faint uppercase tracking-wider`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {digest.pipelines.map((p) => (
              <tr key={p.pipeline_id} className="border-b border-border-subtle/50 hover:bg-white/[0.015]">
                <td className="px-5 py-3 font-bold text-text-bright">{p.pipeline_id}</td>
                <td className="px-5 py-3 text-right text-text-muted">{p.events.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">
                  <span className={`font-bold ${p.success_rate >= 0.95 ? "text-mint" : p.success_rate >= 0.8 ? "text-amber" : "text-coral"}`}>{Math.round(p.success_rate * 100)}%</span>
                </td>
                <td className="px-5 py-3 text-right text-electric-soft">{p.p50_latency_ms ? `${p.p50_latency_ms}ms` : "\u2014"}</td>
                <td className="px-5 py-3 text-right text-amber">${(p.cost_cents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cost savings detail */}
      {digest.pipelines.length > 0 && (() => {
        const savings = digest.pipelines.map((p) => {
          const cpe = p.events > 0 ? p.cost_cents / p.events : 0;
          let savePct = 0;
          let strategy = "";
          if (cpe > 5) { savePct = 0.6; strategy = "Route simple queries to gpt-4o-mini"; }
          else if (cpe > 2) { savePct = 0.4; strategy = "Enable prompt caching + compress context"; }
          else if (cpe > 0.5) { savePct = 0.2; strategy = "Enable prompt caching"; }
          else { savePct = 0.05; strategy = "Already efficient"; }
          return { ...p, cpe, savePct, saveCents: p.cost_cents * savePct, strategy };
        }).filter((s) => s.saveCents > 10);

        if (!savings.length) return null;
        const totalSave = savings.reduce((a, s) => a + s.saveCents, 0);

        return (
          <div className="mt-8 card border-mint/20 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="orb border-mint text-mint text-base w-10 h-10 shrink-0">$</div>
              <div>
                <p className="text-lg font-black text-mint">${(totalSave / 100).toFixed(0)}/week in potential savings</p>
                <p className="text-xs text-text-faint">Based on model routing and caching opportunities</p>
              </div>
            </div>
            <div className="space-y-2">
              {savings.map((s) => (
                <div key={s.pipeline_id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-bold text-text-bright">{s.pipeline_id}</span>
                    <span className="text-text-faint"> — {s.strategy}</span>
                  </div>
                  <span className="font-bold text-mint">${(s.saveCents / 100).toFixed(2)}/wk</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Data Export */}
      {!demo && (
        <div className="mt-8 card border-border-subtle p-5">
          <h4 className="text-sm font-black text-text-bright uppercase tracking-wider mb-3">Export Data</h4>
          <p className="text-text-muted text-sm mb-4">Download all pipeline events for offline analysis.</p>
          <div className="flex gap-3">
            <button
              onClick={() => apiDownload("/v1/export/all?format=json", apiKey, "raircade-export.json")}
              className="btn btn-pink text-xs px-5 py-2.5"
            >
              Export JSON
            </button>
            <button
              onClick={() => apiDownload("/v1/export/all?format=csv", apiKey, "raircade-export.csv")}
              className="btn text-xs px-5 py-2.5 border-border-subtle text-text-muted hover:text-pink hover:border-pink/30 transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── MAIN ─── */

function DemoBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="bg-pink/10 border border-pink/20 rounded-xl px-5 py-3 mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-pink text-lg">&#9889;</span>
        <p className="text-sm">
          <span className="font-bold text-pink">Demo Mode</span>
          <span className="text-text-muted"> &mdash; this is sample data. </span>
          <span className="text-text-normal">Connect your API key to see your real pipelines.</span>
        </p>
      </div>
      <button onClick={onExit} className="btn btn-pink text-[10px] px-3 py-1.5">Connect</button>
    </div>
  );
}

function SavingsBanner({ pipelines, allMetrics }: { pipelines: Pipeline[]; allMetrics: Record<string, Metrics> }) {
  const ranked = pipelines.filter((p) => allMetrics[p.pipeline_id]).map((p) => allMetrics[p.pipeline_id]);
  if (ranked.length === 0) return null;

  let savingsCents = 0;
  for (const m of ranked) {
    const cpe = m.total_events > 0 ? m.total_cost_cents / m.total_events : 0;
    if (cpe > 2) savingsCents += m.total_cost_cents * 0.4;
    else if (cpe > 0.5) savingsCents += m.total_cost_cents * 0.2;
    else savingsCents += m.total_cost_cents * 0.05;
  }

  const monthly = (savingsCents / 100) * 4.3;
  if (monthly < 1) return null;

  return (
    <div className="bg-mint/[0.06] border border-mint/20 rounded-xl px-5 py-4 mb-6 flex items-center gap-4">
      <div className="orb border-mint text-mint text-base w-10 h-10 shrink-0">$</div>
      <div>
        <p className="text-sm">
          <span className="font-black text-mint text-lg">${Math.round(monthly)}/mo</span>
          <span className="text-text-muted"> in potential savings found across {ranked.length} pipelines.</span>
        </p>
        <p className="text-text-faint text-xs mt-0.5">Based on model routing, prompt compression, and caching opportunities. Flip leaderboard cards for details.</p>
      </div>
    </div>
  );
}

function DashboardInner() {
  const searchParams = useSearchParams();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Setup");
  const [demo, setDemo] = useState(false);
  const [allMetrics, setAllMetrics] = useState<Record<string, Metrics>>({});
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    if (searchParams.get("demo") === "1") {
      setDemo(true);
      setApiKey("demo");
      setLoading(false);
      return;
    }
    if (searchParams.get("welcome") === "1") {
      setWelcome(true);
    }
    const stored = localStorage.getItem("raibench_api_key");
    if (stored) setApiKey(stored);
    else setLoading(false);
  }, [searchParams]);

  useEffect(() => {
    if (demo) {
      setPipelines(DEMO_PIPELINES);
      setAllMetrics(DEMO_METRICS);
      setActiveTab("Metrics");
      setLoading(false);
      return;
    }
    if (!apiKey) return;
    apiFetch<{ pipelines: Pipeline[] }>("/v1/pipelines", apiKey)
      .then((d) => {
        setPipelines(d.pipelines);
        if (d.pipelines.length > 0) setActiveTab("Metrics");
        d.pipelines.forEach((p) =>
          apiFetch<Metrics>(`/v1/pipelines/${p.pipeline_id}/metrics?period=30d`, apiKey)
            .then((m) => setAllMetrics((prev) => ({ ...prev, [p.pipeline_id]: m })))
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiKey, demo]);

  const enterDemo = () => {
    setDemo(true);
    setApiKey("demo");
    setLoading(false);
  };

  const exitDemo = () => {
    setDemo(false);
    setApiKey("");
    setPipelines([]);
    setAllMetrics({});
    setActiveTab("Setup");
    localStorage.removeItem("raibench_api_key");
  };

  if (!apiKey && !demo) {
    return (
      <div className="max-w-sm mx-auto mt-20 text-center">
        <div className="orb border-pink text-pink text-xl w-16 h-16 mx-auto mb-6 animate-float">?</div>
        <h2 className="text-xl font-black text-text-bright mb-2">Welcome to RAIR<span className="text-pink">CADE</span></h2>
        <p className="text-text-muted mb-8 text-sm">Your AI pipelines, ranked and optimized.</p>

        <input
          type="text"
          placeholder="rb_xxxxxxxx..."
          className="w-full px-4 py-3 bg-bg-surface border border-border-subtle rounded-xl text-text-bright font-semibold text-center focus:outline-none focus:border-pink placeholder:text-text-faint"
          onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value; localStorage.setItem("raibench_api_key", v); setApiKey(v); } }}
        />
        <p className="text-text-faint text-xs mt-2">Press Enter to connect</p>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-subtle" /></div>
          <div className="relative flex justify-center"><span className="bg-bg-void px-4 text-xs text-text-faint uppercase tracking-wider">or</span></div>
        </div>

        <button onClick={enterDemo} className="w-full py-4 bg-pink/10 border-2 border-pink/30 rounded-xl text-pink font-bold text-sm hover:bg-pink/15 transition-colors group">
          Try the Demo
          <span className="block text-text-muted text-xs font-normal mt-0.5 group-hover:text-text-normal transition-colors">See RAIRCADE in action with sample data — no signup needed</span>
        </button>
      </div>
    );
  }

  if (loading) return <div className="h-40 card animate-shimmer rounded-2xl mt-10 max-w-lg mx-auto" />;

  return (
    <div>
      {welcome && (
        <div className="bg-electric/[0.08] border border-electric/20 rounded-xl px-5 py-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-electric text-lg">&#127881;</span>
            <div>
              <p className="text-sm font-bold text-electric-soft">Welcome to RAIRCADE!</p>
              <p className="text-xs text-text-muted">Your account is ready. Follow the setup steps below to start tracking your AI pipelines.</p>
            </div>
          </div>
          <button onClick={() => setWelcome(false)} className="text-text-faint hover:text-text-muted text-xs font-bold">Dismiss</button>
        </div>
      )}
      {demo && <DemoBanner onExit={exitDemo} />}
      {!demo && <SavingsBanner pipelines={pipelines} allMetrics={allMetrics} />}

      <div className="flex items-center gap-1 mb-8 border-b border-border-subtle">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-xs font-bold tracking-wider uppercase transition-all relative ${
              activeTab === tab ? "text-pink" : "text-text-faint hover:text-text-muted"
            }`}
          >
            {tab}
            {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-pink rounded-t-full" />}
          </button>
        ))}
      </div>

      {activeTab === "Setup" && <SetupTab apiKey={demo ? "rb_demo_xxxxxxxxxxxx" : apiKey} />}
      {activeTab === "Metrics" && <MetricsTab pipelines={pipelines} apiKey={apiKey} demo={demo} />}
      {activeTab === "Pipelines" && <PipelinesTab pipelines={pipelines} apiKey={apiKey} demo={demo} />}
      {activeTab === "Leaderboard" && <LeaderboardTab pipelines={pipelines} apiKey={apiKey} demo={demo} />}
      {activeTab === "Compare" && <CompareTab pipelines={pipelines} apiKey={apiKey} demo={demo} />}
      {activeTab === "Alerts" && <AlertsTab pipelines={pipelines} apiKey={apiKey} demo={demo} />}
      {activeTab === "Digest" && <DigestTab apiKey={apiKey} demo={demo} />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-40 card animate-shimmer rounded-2xl mt-10 max-w-lg mx-auto" />}>
      <DashboardInner />
    </Suspense>
  );
}

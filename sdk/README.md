# RAIRCADE SDK

Production intelligence for AI applications. Know when your LLM pipelines break, why they're slow, and where you're burning money.

[![PyPI](https://img.shields.io/pypi/v/raibench)](https://pypi.org/project/raibench/)
[![Python](https://img.shields.io/pypi/pyversions/raibench)](https://pypi.org/project/raibench/)

## Quick Start

```bash
pip install raibench
```

### Auto-Patch (recommended)

Three lines. Every OpenAI and Anthropic call is traced automatically — no decorators needed.

```python
from raibench import monitor, patch

monitor.init(
    api_key="rb_xxxxxxxx",
    pipeline="my-app",
    api_url="https://raibench-api.fly.dev",
)
patch()

# That's it. Use OpenAI/Anthropic normally — RAIRCADE handles the rest.
import openai

client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
)
# ^ This call is automatically traced with latency, tokens, and cost.
```

### Manual Tracing

For full control, use the `@monitor.trace` decorator on any function:

```python
from raibench import monitor

monitor.init(api_key="rb_xxxxxxxx", pipeline="my-rag-bot")

@monitor.trace(stage="retrieval", provider="pinecone")
async def search_docs(query: str):
    return await vector_db.search(query, top_k=5)

@monitor.trace(stage="generation", provider="openai", model="gpt-4o")
async def generate_answer(query: str, context: list):
    return await openai.chat.completions.create(...)
```

Works as both a decorator and a context manager:

```python
with monitor.trace(stage="generation", provider="openai", model="gpt-4o"):
    result = await client.chat.completions.create(...)
```

## What Gets Tracked

| Metric | Auto-Patch | Manual |
|--------|-----------|--------|
| Latency (ms) | ✅ | ✅ |
| Success/failure | ✅ | ✅ |
| Token count | ✅ | Via metadata |
| Cost (cents) | ✅ | Via metadata |
| Provider & model | ✅ | You specify |
| Stage (retrieval/generation) | "generation" | You specify |

## CLI

```bash
# Show which AI providers are installed
raibench auto-patch --detect

# Print setup code to paste into your app
raibench auto-patch
```

## Pipeline Badges

Embed live health badges in your README:

```markdown
![status](https://raibench-api.fly.dev/badge/YOUR_API_KEY/my-pipeline?metric=status)
![success](https://raibench-api.fly.dev/badge/YOUR_API_KEY/my-pipeline?metric=success_rate)
![latency](https://raibench-api.fly.dev/badge/YOUR_API_KEY/my-pipeline?metric=latency)
```

Badge colors update automatically: 🟢 healthy (>95%) · 🟡 degraded (85-95%) · 🔴 failing (<85%)

## Supported Providers

**Auto-patch** (zero-code instrumentation):
- OpenAI (`chat.completions.create`, sync + async)
- Anthropic (`messages.create`, sync + async)

**Manual tracing** (any provider):
- Pinecone, Weaviate, Cohere, or any API — just wrap it with `@monitor.trace`

## Dashboard

Your metrics appear in the [RAIRCADE dashboard](https://dashboard-virid-tau-33.vercel.app):

- **Metrics tab** — success rate, latency percentiles, cost over time
- **Leaderboard** — rank pipelines, get AI-powered optimization suggestions
- **Alerts** — Slack/Discord webhooks when thresholds are crossed
- **Badges** — embeddable SVGs for your repo

## License

MIT

# RAIRCADE

> Production intelligence for AI applications. Sentry for your LLM pipelines.

**[Live Dashboard](https://dashboard-virid-tau-33.vercel.app)** · **[Try the Demo](https://dashboard-virid-tau-33.vercel.app/dashboard?demo=1)** · **[SDK Docs](sdk/README.md)**

## What It Does

RAIRCADE tells you what's actually happening in your AI pipelines:

- **Success rates** — how often your LLM calls actually work
- **Latency** — p50/p95, broken down by stage (retrieval vs. generation)
- **Cost** — per-event cost tracking with automatic model pricing
- **AI suggestions** — Claude analyzes your metrics and gives you copy-paste Python fixes
- **Alerts** — Slack/Discord notifications when things go sideways
- **Badges** — live health badges for your README

## Quick Start

```bash
pip install raibench
```

```python
from raibench import monitor, patch

monitor.init(api_key="rb_xxxxxxxx", pipeline="my-app")
patch()  # auto-instruments OpenAI & Anthropic

# Use your AI SDKs normally — every call is traced.
```

That's it. Open your [dashboard](https://dashboard-virid-tau-33.vercel.app) and watch the metrics flow in.

## Architecture

```
┌──────────┐     ┌──────────────┐     ┌───────────────┐
│ Your App │────▶│ RAIRCADE SDK │────▶│ FastAPI + PG   │
│ + OpenAI │     │ (auto-patch) │     │ (Fly.io)       │
└──────────┘     └──────────────┘     └───────┬───────┘
                                              │
                                      ┌───────▼───────┐
                                      │ Next.js Dash  │
                                      │ (Vercel)      │
                                      └───────────────┘
```

| Component | Stack | Location |
|-----------|-------|----------|
| `sdk/` | Python, Pydantic, httpx | [PyPI](https://pypi.org/project/raibench/) |
| `api/` | FastAPI, asyncpg, PostgreSQL | [Fly.io](https://raibench-api.fly.dev) |
| `dashboard/` | Next.js, Tailwind, Recharts | [Vercel](https://dashboard-virid-tau-33.vercel.app) |

## Features

| Feature | Status |
|---------|--------|
| Auto-patch OpenAI & Anthropic | ✅ |
| Manual `@monitor.trace` decorator | ✅ |
| Success rate, latency, cost metrics | ✅ |
| Time-series charts | ✅ |
| Pipeline leaderboard | ✅ |
| AI-powered optimization suggestions | ✅ |
| Slack & Discord alerts | ✅ |
| Embeddable README badges | ✅ |
| Demo mode (no signup) | ✅ |
| GitHub OAuth | ✅ |

## Local Development

```bash
# Database
docker compose up -d

# SDK
cd sdk && pip install -e ".[dev]"
pytest

# API
cd api && pip install -e ".[dev]"
uvicorn raibench_api.main:app --reload

# Dashboard
cd dashboard && npm install && npm run dev
```

## License

MIT

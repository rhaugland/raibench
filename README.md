# RAI Bench

Production intelligence platform for AI applications. Monitor your RAG pipeline's real-world performance.

## Local Development

```bash
# Start database
docker compose up -d

# SDK development
cd sdk && pip install -e ".[dev]"

# API development
cd api && pip install -e ".[dev]"

# Dashboard development
cd dashboard && npm install && npm run dev
```

## Architecture

- `sdk/` — Python SDK that instruments AI calls
- `api/` — FastAPI ingestion + metrics API
- `dashboard/` — Next.js monitoring dashboard

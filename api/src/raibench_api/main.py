from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, Header, HTTPException

from raibench_api.db import close_pool, get_pool, init_pool
from raibench_api.models import EventIn, IngestResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="RAI Bench API", lifespan=lifespan)


async def authenticate(authorization: str = Header()) -> str:
    """Validate API key and return user_id."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    api_key = authorization.removeprefix("Bearer ")
    pool = await get_pool()

    row = await pool.fetchrow(
        "SELECT id FROM users WHERE api_key = $1", api_key
    )
    if not row:
        raise HTTPException(status_code=401, detail="Invalid API key")

    return str(row["id"])


@app.post("/v1/events", response_model=IngestResponse, status_code=202)
async def ingest_events(
    events: list[EventIn],
    authorization: str = Header(),
):
    user_id = await authenticate(authorization)
    pool = await get_pool()

    async with pool.acquire() as conn:
        for event in events:
            await conn.execute(
                """
                INSERT INTO events (
                    user_id, pipeline_id, stage, provider, model,
                    latency_ms, token_count, cost_cents, success,
                    task_category, retrieval_chunks, retrieval_score_avg, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                """,
                user_id,
                event.pipeline_id,
                event.stage,
                event.provider,
                event.model,
                event.latency_ms,
                event.token_count,
                float(event.cost_cents) if event.cost_cents is not None else None,
                event.success,
                event.task_category,
                event.retrieval_chunks,
                float(event.retrieval_score_avg) if event.retrieval_score_avg is not None else None,
                str(event.metadata) if event.metadata else None,
            )

    return IngestResponse(accepted=len(events))


@app.get("/health")
async def health():
    return {"status": "ok"}

import os
import secrets
from contextlib import asynccontextmanager

import asyncpg
import httpx
import jwt
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from raibench_api.db import close_pool, get_pool, init_pool
from raibench_api.metrics import get_pipeline_metrics, get_pipeline_metrics_by_stage, get_pipeline_timeseries, get_pipelines
from raibench_api.models import EventIn, IngestResponse

GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="RAI Bench API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://dashboard-virid-tau-33.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/v1/pipelines")
async def list_pipelines(authorization: str = Header()):
    user_id = await authenticate(authorization)
    pipelines = await get_pipelines(user_id)
    return {"pipelines": pipelines}


@app.get("/v1/pipelines/{pipeline_id}/metrics")
async def pipeline_metrics(
    pipeline_id: str,
    period: str = "24h",
    group_by: str | None = None,
    authorization: str = Header(),
):
    user_id = await authenticate(authorization)

    if group_by == "stage":
        stages = await get_pipeline_metrics_by_stage(user_id, pipeline_id, period)
        base = await get_pipeline_metrics(user_id, pipeline_id, period)
        return {**base, "stages": stages}

    return await get_pipeline_metrics(user_id, pipeline_id, period)


@app.get("/v1/pipelines/{pipeline_id}/timeseries")
async def pipeline_timeseries(
    pipeline_id: str,
    period: str = "24h",
    bucket: str = "1h",
    authorization: str = Header(),
):
    user_id = await authenticate(authorization)
    buckets = await get_pipeline_timeseries(user_id, pipeline_id, period, bucket)
    return {"pipeline_id": pipeline_id, "period": period, "bucket": bucket, "buckets": buckets}


@app.get("/v1/auth/github")
async def github_auth_redirect():
    """Redirect user to GitHub OAuth."""
    return {
        "url": f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&scope=user:email"
    }


@app.post("/v1/auth/github/callback")
async def github_auth_callback(code: str):
    """Exchange GitHub code for user session + API key."""
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
            headers={"accept": "application/json"},
        )
        access_token = token_resp.json().get("access_token")

        if not access_token:
            raise HTTPException(status_code=400, detail="Invalid code")

        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"authorization": f"Bearer {access_token}"},
        )
        github_user = user_resp.json()

    pool = await get_pool()
    github_id = github_user["id"]
    username = github_user["login"]
    email = github_user.get("email")

    row = await pool.fetchrow(
        "SELECT id, api_key FROM users WHERE github_id = $1", github_id
    )

    if row:
        user_id = str(row["id"])
        api_key = row["api_key"]
    else:
        api_key = f"rb_{secrets.token_urlsafe(32)}"
        new_row = await pool.fetchrow(
            """
            INSERT INTO users (github_id, github_username, email, api_key)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            github_id,
            username,
            email,
            api_key,
        )
        user_id = str(new_row["id"])

    token = jwt.encode({"user_id": user_id, "username": username}, JWT_SECRET, algorithm="HS256")

    return {"token": token, "api_key": api_key, "username": username}

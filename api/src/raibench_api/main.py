import csv
import io
import json
import os
import secrets
from contextlib import asynccontextmanager

import asyncpg
import httpx
import jwt
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import Response, StreamingResponse

from raibench_api.alerts import (
    check_and_fire_alerts,
    create_alert_rule,
    delete_alert_rule,
    get_alert_rules,
    send_test_webhook,
)
from raibench_api.analyze import get_suggestions
from raibench_api.email import send_all_digests, send_digest_email
from raibench_api.badges import latency_badge, status_badge, success_rate_badge
from raibench_api.db import close_pool, get_pool, init_pool
from raibench_api.metrics import (
    get_pipeline_metrics,
    get_pipeline_metrics_by_stage,
    get_pipeline_timeseries,
    get_pipelines,
    get_recent_errors,
    get_recent_events,
    get_weekly_digest,
)
from raibench_api.models import AlertRuleIn, EventIn, IngestResponse
from raibench_api.ratelimit import RateLimitMiddleware

GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="RAI Bench API", lifespan=lifespan)

app.add_middleware(RateLimitMiddleware)
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

    # Fire alerts for affected pipelines (best effort, non-blocking)
    pipeline_ids = {e.pipeline_id for e in events}
    for pid in pipeline_ids:
        try:
            m = await get_pipeline_metrics(user_id, pid, "1h")
            await check_and_fire_alerts(user_id, pid, m)
        except Exception:
            pass

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


@app.get("/v1/pipelines/{pipeline_id}/events/recent")
async def recent_events(
    pipeline_id: str,
    limit: int = 50,
    authorization: str = Header(),
):
    """Get most recent events for a pipeline."""
    user_id = await authenticate(authorization)
    events = await get_recent_events(user_id, pipeline_id, min(limit, 200))
    return {"pipeline_id": pipeline_id, "events": events}


@app.get("/v1/pipelines/{pipeline_id}/errors")
async def pipeline_errors(
    pipeline_id: str,
    limit: int = 50,
    authorization: str = Header(),
):
    """Get recent errors for a pipeline."""
    user_id = await authenticate(authorization)
    errors = await get_recent_errors(user_id, pipeline_id, min(limit, 200))
    return {"pipeline_id": pipeline_id, "errors": errors}


@app.get("/v1/digest")
async def weekly_digest(authorization: str = Header()):
    """Get weekly digest summary across all pipelines."""
    user_id = await authenticate(authorization)
    digest = await get_weekly_digest(user_id)
    return digest


@app.post("/v1/digest/send")
async def send_digest(authorization: str = Header()):
    """Send weekly digest email to current user."""
    user_id = await authenticate(authorization)
    ok = await send_digest_email(user_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Could not send digest. Check email is set and RESEND_API_KEY is configured.")
    return {"sent": True}


@app.post("/v1/digest/send-all")
async def send_all_digest(authorization: str = Header()):
    """Send digest to all users. Protected by cron secret."""
    cron_secret = os.environ.get("CRON_SECRET", "")
    if not cron_secret or authorization != f"Bearer {cron_secret}":
        raise HTTPException(status_code=403, detail="Forbidden")
    return await send_all_digests()


@app.get("/v1/pipelines/{pipeline_id}/suggestions")
async def pipeline_suggestions(
    pipeline_id: str,
    authorization: str = Header(),
):
    """Get AI-powered optimization suggestions for a pipeline."""
    user_id = await authenticate(authorization)
    metrics = await get_pipeline_metrics(user_id, pipeline_id, "30d")
    suggestions = await get_suggestions(pipeline_id, metrics)
    return {"pipeline_id": pipeline_id, "suggestions": suggestions}


# ─── Alerts ───

@app.get("/v1/alerts")
async def list_alerts(
    pipeline_id: str | None = None,
    authorization: str = Header(),
):
    user_id = await authenticate(authorization)
    rules = await get_alert_rules(user_id, pipeline_id)
    return {"rules": [{**r, "id": str(r["id"]), "user_id": str(r["user_id"])} for r in rules]}


@app.post("/v1/alerts", status_code=201)
async def create_alert(
    rule: AlertRuleIn,
    authorization: str = Header(),
):
    user_id = await authenticate(authorization)
    created = await create_alert_rule(
        user_id, rule.pipeline_id, rule.webhook_url,
        rule.channel, rule.metric, rule.operator, rule.threshold,
    )
    return {"rule": {**created, "id": str(created["id"]), "user_id": str(created["user_id"])}}


@app.delete("/v1/alerts/{rule_id}")
async def remove_alert(rule_id: str, authorization: str = Header()):
    user_id = await authenticate(authorization)
    deleted = await delete_alert_rule(user_id, rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return {"deleted": True}


@app.post("/v1/alerts/test")
async def test_alert_webhook(
    webhook_url: str,
    channel: str = "slack",
    authorization: str = Header(),
):
    await authenticate(authorization)
    success = await send_test_webhook(webhook_url, channel)
    if not success:
        raise HTTPException(status_code=400, detail="Webhook delivery failed")
    return {"success": True}


# ─── Data Export ───

@app.get("/v1/pipelines/{pipeline_id}/export")
async def export_pipeline_data(
    pipeline_id: str,
    format: str = Query("json", pattern="^(json|csv)$"),
    period: str = "30d",
    authorization: str = Header(),
):
    """Export pipeline events as JSON or CSV."""
    user_id = await authenticate(authorization)
    events = await get_recent_events(user_id, pipeline_id, 10000)

    if format == "csv":
        output = io.StringIO()
        if events:
            writer = csv.DictWriter(output, fieldnames=events[0].keys())
            writer.writeheader()
            writer.writerows(events)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={pipeline_id}-events.csv"},
        )

    return StreamingResponse(
        iter([json.dumps({"pipeline_id": pipeline_id, "events": events}, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={pipeline_id}-events.json"},
    )


@app.get("/v1/export/all")
async def export_all_data(
    format: str = Query("json", pattern="^(json|csv)$"),
    authorization: str = Header(),
):
    """Export all pipeline data."""
    user_id = await authenticate(authorization)
    pipelines = await get_pipelines(user_id)

    all_events = []
    for p in pipelines:
        events = await get_recent_events(user_id, p["pipeline_id"], 10000)
        all_events.extend(events)

    if format == "csv":
        output = io.StringIO()
        if all_events:
            writer = csv.DictWriter(output, fieldnames=all_events[0].keys())
            writer.writeheader()
            writer.writerows(all_events)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=raircade-export.csv"},
        )

    return StreamingResponse(
        iter([json.dumps({"events": all_events}, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=raircade-export.json"},
    )


# ─── Badges (public, no auth) ───

@app.get("/badge/{api_key}/{pipeline_id}")
async def pipeline_badge(
    api_key: str,
    pipeline_id: str,
    metric: str = "status",
):
    """Public SVG badge — embed in README with no auth needed."""
    pool = await get_pool()
    row = await pool.fetchrow("SELECT id FROM users WHERE api_key = $1", api_key)
    if not row:
        svg = status_badge(pipeline_id, None)
        return Response(content=svg, media_type="image/svg+xml", headers={"Cache-Control": "no-cache, max-age=300"})

    user_id = str(row["id"])
    metrics = await get_pipeline_metrics(user_id, pipeline_id, "24h")

    if metric == "success_rate":
        svg = success_rate_badge(pipeline_id, metrics.get("success_rate"))
    elif metric == "latency":
        svg = latency_badge(pipeline_id, metrics.get("p50_latency_ms"))
    else:
        svg = status_badge(pipeline_id, metrics.get("success_rate"))

    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=300"},
    )


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

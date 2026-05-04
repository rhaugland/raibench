from raibench_api.db import get_pool


PERIOD_TO_INTERVAL = {
    "1h": "1 hour",
    "24h": "24 hours",
    "7d": "7 days",
    "30d": "30 days",
}


async def get_pipelines(user_id: str) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT pipeline_id, COUNT(*) as event_count,
               MAX(created_at) as last_event
        FROM events
        WHERE user_id = $1
        GROUP BY pipeline_id
        ORDER BY last_event DESC
        """,
        user_id,
    )
    return [
        {
            "pipeline_id": row["pipeline_id"],
            "event_count": row["event_count"],
            "last_event": row["last_event"].isoformat(),
        }
        for row in rows
    ]


async def get_pipeline_metrics(user_id: str, pipeline_id: str, period: str) -> dict:
    pool = await get_pool()
    interval = PERIOD_TO_INTERVAL.get(period, "24 hours")

    row = await pool.fetchrow(
        f"""
        SELECT
            COUNT(*) as total_events,
            AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) as success_rate,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50_latency_ms,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency_ms,
            COALESCE(SUM(cost_cents), 0) as total_cost_cents
        FROM events
        WHERE user_id = $1
          AND pipeline_id = $2
          AND created_at > NOW() - INTERVAL '{interval}'
        """,
        user_id,
        pipeline_id,
    )

    return {
        "pipeline_id": pipeline_id,
        "period": period,
        "total_events": row["total_events"],
        "success_rate": float(row["success_rate"]) if row["success_rate"] else 0,
        "p50_latency_ms": int(row["p50_latency_ms"]) if row["p50_latency_ms"] else None,
        "p95_latency_ms": int(row["p95_latency_ms"]) if row["p95_latency_ms"] else None,
        "total_cost_cents": float(row["total_cost_cents"]),
    }


async def get_pipeline_metrics_by_stage(user_id: str, pipeline_id: str, period: str) -> list[dict]:
    pool = await get_pool()
    interval = PERIOD_TO_INTERVAL.get(period, "24 hours")

    rows = await pool.fetch(
        f"""
        SELECT
            stage,
            COUNT(*) as total_events,
            AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) as success_rate,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50_latency_ms,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency_ms,
            COALESCE(SUM(cost_cents), 0) as total_cost_cents
        FROM events
        WHERE user_id = $1
          AND pipeline_id = $2
          AND created_at > NOW() - INTERVAL '{interval}'
        GROUP BY stage
        """,
        user_id,
        pipeline_id,
    )

    return [
        {
            "stage": row["stage"],
            "total_events": row["total_events"],
            "success_rate": float(row["success_rate"]) if row["success_rate"] else 0,
            "p50_latency_ms": int(row["p50_latency_ms"]) if row["p50_latency_ms"] else None,
            "p95_latency_ms": int(row["p95_latency_ms"]) if row["p95_latency_ms"] else None,
            "total_cost_cents": float(row["total_cost_cents"]),
        }
        for row in rows
    ]


async def get_recent_events(user_id: str, pipeline_id: str, limit: int = 50) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT pipeline_id, stage, provider, model, latency_ms,
               token_count, cost_cents, success, metadata, created_at
        FROM events
        WHERE user_id = $1 AND pipeline_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        """,
        user_id, pipeline_id, limit,
    )
    return [
        {
            "pipeline_id": row["pipeline_id"],
            "stage": row["stage"],
            "provider": row["provider"],
            "model": row["model"],
            "latency_ms": row["latency_ms"],
            "token_count": row["token_count"],
            "cost_cents": float(row["cost_cents"]) if row["cost_cents"] else None,
            "success": row["success"],
            "metadata": row["metadata"],
            "created_at": row["created_at"].isoformat(),
        }
        for row in rows
    ]


async def get_recent_errors(user_id: str, pipeline_id: str, limit: int = 50) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT stage, provider, model, latency_ms, metadata, created_at
        FROM events
        WHERE user_id = $1 AND pipeline_id = $2 AND success = false
        ORDER BY created_at DESC
        LIMIT $3
        """,
        user_id, pipeline_id, limit,
    )
    return [
        {
            "stage": row["stage"],
            "provider": row["provider"],
            "model": row["model"],
            "latency_ms": row["latency_ms"],
            "error": _extract_error(row["metadata"]),
            "created_at": row["created_at"].isoformat(),
        }
        for row in rows
    ]


def _extract_error(metadata) -> str:
    """Extract error message from metadata JSONB."""
    if not metadata:
        return "Unknown error"
    if isinstance(metadata, dict):
        return metadata.get("error", str(metadata))
    if isinstance(metadata, str):
        try:
            import json
            m = json.loads(metadata)
            return m.get("error", metadata)
        except (json.JSONDecodeError, AttributeError):
            return metadata
    return str(metadata)


async def get_weekly_digest(user_id: str) -> dict:
    """Get weekly summary across all pipelines for digest email."""
    pool = await get_pool()

    # This week vs last week
    row = await pool.fetchrow(
        """
        SELECT
            COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as this_week_events,
            COUNT(CASE WHEN created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' THEN 1 END) as last_week_events,
            AVG(CASE WHEN created_at > NOW() - INTERVAL '7 days' AND success THEN 1.0
                     WHEN created_at > NOW() - INTERVAL '7 days' THEN 0.0
                     ELSE NULL END) as this_week_success,
            AVG(CASE WHEN created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' AND success THEN 1.0
                     WHEN created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' THEN 0.0
                     ELSE NULL END) as last_week_success,
            COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN cost_cents END), 0) as this_week_cost,
            COALESCE(SUM(CASE WHEN created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' THEN cost_cents END), 0) as last_week_cost
        FROM events
        WHERE user_id = $1
          AND created_at > NOW() - INTERVAL '14 days'
        """,
        user_id,
    )

    # Per-pipeline breakdown
    pipelines = await pool.fetch(
        """
        SELECT
            pipeline_id,
            COUNT(*) as events,
            AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) as success_rate,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50_latency_ms,
            COALESCE(SUM(cost_cents), 0) as cost_cents
        FROM events
        WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
        GROUP BY pipeline_id
        ORDER BY COUNT(*) DESC
        """,
        user_id,
    )

    this_week_success = float(row["this_week_success"]) if row["this_week_success"] else 0
    last_week_success = float(row["last_week_success"]) if row["last_week_success"] else 0
    this_week_cost = float(row["this_week_cost"])
    last_week_cost = float(row["last_week_cost"])

    return {
        "this_week": {
            "events": row["this_week_events"],
            "success_rate": this_week_success,
            "cost_cents": this_week_cost,
        },
        "last_week": {
            "events": row["last_week_events"],
            "success_rate": last_week_success,
            "cost_cents": last_week_cost,
        },
        "changes": {
            "events_delta": row["this_week_events"] - row["last_week_events"],
            "success_delta": this_week_success - last_week_success,
            "cost_delta": this_week_cost - last_week_cost,
        },
        "pipelines": [
            {
                "pipeline_id": p["pipeline_id"],
                "events": p["events"],
                "success_rate": float(p["success_rate"]) if p["success_rate"] else 0,
                "p50_latency_ms": int(p["p50_latency_ms"]) if p["p50_latency_ms"] else None,
                "cost_cents": float(p["cost_cents"]),
            }
            for p in pipelines
        ],
    }


BUCKET_TO_TRUNC = {
    "5m": "hour",     # date_trunc doesn't support 5min, fall back to hour
    "1h": "hour",
    "1d": "day",
}


async def get_pipeline_timeseries(
    user_id: str, pipeline_id: str, period: str, bucket: str
) -> list[dict]:
    pool = await get_pool()
    interval = PERIOD_TO_INTERVAL.get(period, "24 hours")
    trunc_unit = BUCKET_TO_TRUNC.get(bucket, "hour")

    rows = await pool.fetch(
        f"""
        SELECT
            date_trunc('{trunc_unit}', created_at) as timestamp,
            COUNT(*) as event_count,
            AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) as success_rate,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50_latency_ms,
            COALESCE(SUM(cost_cents), 0) as total_cost_cents
        FROM events
        WHERE user_id = $1
          AND pipeline_id = $2
          AND created_at > NOW() - INTERVAL '{interval}'
        GROUP BY timestamp
        ORDER BY timestamp
        """,
        user_id,
        pipeline_id,
    )

    return [
        {
            "timestamp": row["timestamp"].isoformat(),
            "event_count": row["event_count"],
            "success_rate": float(row["success_rate"]) if row["success_rate"] else 0,
            "p50_latency_ms": int(row["p50_latency_ms"]) if row["p50_latency_ms"] else None,
            "total_cost_cents": float(row["total_cost_cents"]),
        }
        for row in rows
    ]

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

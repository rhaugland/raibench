from raibench_api.db import get_pool

REGRESSION_THRESHOLD = 0.10


async def detect_regressions(user_id: str, pipeline_id: str) -> list[dict]:
    """Compare last 24h vs previous 24h. Return list of detected regressions."""
    pool = await get_pool()

    row = await pool.fetchrow(
        """
        SELECT
            AVG(CASE WHEN created_at > NOW() - INTERVAL '24 hours' AND success THEN 1.0
                     WHEN created_at > NOW() - INTERVAL '24 hours' THEN 0.0
                     ELSE NULL END) as current_success_rate,
            AVG(CASE WHEN created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours' AND success THEN 1.0
                     WHEN created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours' THEN 0.0
                     ELSE NULL END) as previous_success_rate,
            COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as current_count,
            COUNT(CASE WHEN created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours' THEN 1 END) as previous_count
        FROM events
        WHERE user_id = $1 AND pipeline_id = $2
          AND created_at > NOW() - INTERVAL '48 hours'
        """,
        user_id,
        pipeline_id,
    )

    regressions = []

    if (
        row["current_success_rate"] is not None
        and row["previous_success_rate"] is not None
        and row["current_count"] >= 5
        and row["previous_count"] >= 5
    ):
        current = float(row["current_success_rate"])
        previous = float(row["previous_success_rate"])
        drop = previous - current

        if drop >= REGRESSION_THRESHOLD:
            regressions.append({
                "type": "success_rate_drop",
                "pipeline_id": pipeline_id,
                "current": current,
                "previous": previous,
                "drop": drop,
            })

    return regressions

"""Data retention — delete events older than the configured threshold."""

import os

from raibench_api.db import get_pool

RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "90"))


async def cleanup_old_events() -> dict:
    """Delete events older than RETENTION_DAYS. Returns count deleted."""
    pool = await get_pool()
    result = await pool.execute(
        f"DELETE FROM events WHERE created_at < NOW() - INTERVAL '{RETENTION_DAYS} days'"
    )
    # asyncpg returns "DELETE <count>"
    count = int(result.split()[-1]) if result else 0
    return {"deleted": count, "retention_days": RETENTION_DAYS}

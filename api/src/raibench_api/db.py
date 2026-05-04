import os

import asyncpg

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://raibench:raibench_dev@localhost:5432/raibench"
)

pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return pool


async def close_pool() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None


async def get_pool() -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("Database pool not initialized")
    return pool


async def run_migrations() -> None:
    """Run all migration files in order."""
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "..", "migrations")
    migrations_dir = os.path.abspath(migrations_dir)

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        migration_file = os.path.join(migrations_dir, "001_initial.sql")
        with open(migration_file) as f:
            sql = f.read()
        await conn.execute(sql)
    finally:
        await conn.close()

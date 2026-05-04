"""
End-to-end test: SDK -> API -> DB -> Metrics.
Requires: docker compose up -d (TimescaleDB running on localhost:5432)

Run with: pytest tests/test_e2e.py -v
Skip reason: Skipped automatically if database is not available.
"""
import asyncio
import os
import sys

import pytest

# Add SDK and API to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api", "src"))

os.environ.setdefault(
    "DATABASE_URL", "postgresql://raibench:raibench_dev@localhost:5432/raibench"
)


def db_available():
    """Check if the database is reachable."""
    try:
        import asyncpg
        loop = asyncio.new_event_loop()
        conn = loop.run_until_complete(asyncpg.connect(os.environ["DATABASE_URL"], timeout=2))
        loop.run_until_complete(conn.close())
        loop.close()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not db_available(), reason="Database not available (run docker compose up -d)"
)


@pytest.fixture(scope="module")
async def api_server():
    """Start the API server for testing."""
    from raibench_api.main import app
    import uvicorn

    config = uvicorn.Config(app, host="127.0.0.1", port=8765, log_level="error")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    await asyncio.sleep(1.0)
    yield "http://127.0.0.1:8765"
    server.should_exit = True
    await task


@pytest.fixture(scope="module")
async def test_user():
    """Create a test user and return API key."""
    import secrets
    import asyncpg

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    api_key = f"rb_{secrets.token_urlsafe(16)}"
    await conn.execute(
        """
        INSERT INTO users (github_id, github_username, api_key)
        VALUES (99999, 'e2e-test', $1)
        ON CONFLICT (github_id) DO UPDATE SET api_key = $1
        """,
        api_key,
    )
    await conn.close()
    return api_key


@pytest.mark.asyncio
async def test_full_flow(api_server, test_user):
    """SDK sends events -> API stores them -> metrics endpoint returns data."""
    import httpx
    from raibench.monitor import Monitor

    # 1. Initialize SDK pointing at test server
    mon = Monitor()
    mon.init(
        api_key=test_user,
        pipeline="e2e-test",
        category="integration",
        api_url=api_server,
    )

    # 2. Record some events
    with mon.trace(stage="retrieval", provider="pinecone") as span:
        await asyncio.sleep(0.01)

    with mon.trace(stage="generation", provider="openai", model="gpt-4o") as span:
        await asyncio.sleep(0.02)

    # 3. Force flush
    if mon._buffer:
        await mon._buffer.shutdown()

    # 4. Query metrics API
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{api_server}/v1/pipelines/e2e-test/metrics?period=24h",
            headers={"authorization": f"Bearer {test_user}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_events"] >= 2
    assert data["success_rate"] == 1.0
    assert data["p50_latency_ms"] is not None

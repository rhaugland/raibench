import os
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def mock_pool():
    """Mock the database pool for testing without a real DB."""
    conn = AsyncMock()
    conn.execute = AsyncMock()

    # acquire() must be a sync callable returning an async context manager
    acquire_ctx = MagicMock()
    acquire_ctx.__aenter__ = AsyncMock(return_value=conn)
    acquire_ctx.__aexit__ = AsyncMock(return_value=False)

    pool = AsyncMock()
    pool.acquire = MagicMock(return_value=acquire_ctx)
    # Default: no row found (unauthorized). Tests that need auth use auth_header fixture.
    pool.fetchrow = AsyncMock(return_value=None)
    return pool


@pytest.fixture
async def client(mock_pool):
    """Test client with mocked database."""
    with patch("raibench_api.db.pool", mock_pool):
        with patch("raibench_api.main.get_pool", AsyncMock(return_value=mock_pool)):
            from raibench_api.main import app

            # Skip lifespan (no real DB)
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as ac:
                yield ac


@pytest.fixture
def valid_api_key():
    return "test-api-key-123"


@pytest.fixture
def auth_header(valid_api_key, mock_pool):
    """Configure mock to accept the test API key."""
    import uuid
    user_id = str(uuid.uuid4())
    mock_pool.fetchrow.return_value = {"id": user_id}
    return {"authorization": f"Bearer {valid_api_key}"}

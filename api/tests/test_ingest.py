import pytest
from unittest.mock import AsyncMock


@pytest.mark.asyncio
async def test_ingest_events_success(client, auth_header):
    events = [
        {
            "pipeline_id": "support-bot",
            "stage": "generation",
            "provider": "openai",
            "model": "gpt-4o",
            "latency_ms": 1240,
            "token_count": 3200,
            "cost_cents": 0.8,
            "success": True,
            "task_category": "support-qa",
        },
        {
            "pipeline_id": "support-bot",
            "stage": "retrieval",
            "latency_ms": 50,
            "success": True,
        },
    ]

    response = await client.post("/v1/events", json=events, headers=auth_header)

    assert response.status_code == 202
    assert response.json() == {"accepted": 2}


@pytest.mark.asyncio
async def test_ingest_events_unauthorized(client, mock_pool):
    mock_pool.fetchrow.return_value = None  # Invalid key

    response = await client.post(
        "/v1/events",
        json=[{"pipeline_id": "x", "stage": "y", "latency_ms": 1, "success": True}],
        headers={"authorization": "Bearer invalid-key"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_ingest_events_invalid_body(client, auth_header):
    response = await client.post(
        "/v1/events",
        json=[{"pipeline_id": "x"}],  # Missing required fields
        headers=auth_header,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

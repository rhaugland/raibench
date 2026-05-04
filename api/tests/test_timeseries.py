import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_get_timeseries(client, auth_header):
    mock_buckets = [
        {
            "timestamp": "2026-05-03T10:00:00+00:00",
            "event_count": 25,
            "success_rate": 0.92,
            "p50_latency_ms": 150,
            "total_cost_cents": 3.5,
        },
        {
            "timestamp": "2026-05-03T11:00:00+00:00",
            "event_count": 30,
            "success_rate": 0.97,
            "p50_latency_ms": 130,
            "total_cost_cents": 4.2,
        },
    ]

    with patch("raibench_api.main.get_pipeline_timeseries", AsyncMock(return_value=mock_buckets)):
        response = await client.get(
            "/v1/pipelines/bot/timeseries?period=24h&bucket=1h",
            headers=auth_header,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["pipeline_id"] == "bot"
    assert data["period"] == "24h"
    assert data["bucket"] == "1h"
    assert "buckets" in data
    assert len(data["buckets"]) == 2
    bucket = data["buckets"][0]
    assert "timestamp" in bucket
    assert "event_count" in bucket
    assert "success_rate" in bucket
    assert "p50_latency_ms" in bucket
    assert "total_cost_cents" in bucket

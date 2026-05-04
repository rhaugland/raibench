import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_get_pipelines(client, auth_header):
    mock_pipelines = [
        {"pipeline_id": "bot", "event_count": 100, "last_event": "2026-05-03T12:00:00+00:00"},
        {"pipeline_id": "other", "event_count": 50, "last_event": "2026-05-02T12:00:00+00:00"},
    ]

    with patch("raibench_api.main.get_pipelines", AsyncMock(return_value=mock_pipelines)):
        response = await client.get("/v1/pipelines", headers=auth_header)

    assert response.status_code == 200
    data = response.json()
    assert len(data["pipelines"]) == 2
    names = [p["pipeline_id"] for p in data["pipelines"]]
    assert "bot" in names
    assert "other" in names


@pytest.mark.asyncio
async def test_get_pipeline_metrics(client, auth_header):
    mock_metrics = {
        "pipeline_id": "bot",
        "period": "24h",
        "total_events": 100,
        "success_rate": 0.95,
        "p50_latency_ms": 150,
        "p95_latency_ms": 450,
        "total_cost_cents": 12.5,
    }

    with patch("raibench_api.main.get_pipeline_metrics", AsyncMock(return_value=mock_metrics)):
        response = await client.get(
            "/v1/pipelines/bot/metrics?period=24h",
            headers=auth_header,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["pipeline_id"] == "bot"
    assert data["total_events"] == 100
    assert data["success_rate"] == 0.95


@pytest.mark.asyncio
async def test_get_pipeline_metrics_by_stage(client, auth_header):
    mock_base = {
        "pipeline_id": "bot",
        "period": "24h",
        "total_events": 100,
        "success_rate": 0.95,
        "p50_latency_ms": 150,
        "p95_latency_ms": 450,
        "total_cost_cents": 12.5,
    }
    mock_stages = [
        {"stage": "generation", "total_events": 60, "success_rate": 0.9, "p50_latency_ms": 200, "p95_latency_ms": 500, "total_cost_cents": 10.0},
        {"stage": "retrieval", "total_events": 40, "success_rate": 1.0, "p50_latency_ms": 50, "p95_latency_ms": 100, "total_cost_cents": 2.5},
    ]

    with patch("raibench_api.main.get_pipeline_metrics", AsyncMock(return_value=mock_base)), \
         patch("raibench_api.main.get_pipeline_metrics_by_stage", AsyncMock(return_value=mock_stages)):
        response = await client.get(
            "/v1/pipelines/bot/metrics?period=24h&group_by=stage",
            headers=auth_header,
        )

    assert response.status_code == 200
    data = response.json()
    assert "stages" in data
    stages = {s["stage"]: s for s in data["stages"]}
    assert "generation" in stages
    assert "retrieval" in stages

import pytest
import httpx
import respx

from raibench.client import RaiBenchClient
from raibench.types import Event


@pytest.fixture
def client():
    return RaiBenchClient(
        api_url="https://api.raibench.dev",
        api_key="test-key-123",
    )


@pytest.fixture
def sample_events():
    return [
        Event(pipeline_id="bot", stage="generation", latency_ms=100, success=True),
        Event(pipeline_id="bot", stage="retrieval", latency_ms=50, success=True),
    ]


@respx.mock
@pytest.mark.asyncio
async def test_send_events_success(client, sample_events):
    route = respx.post("https://api.raibench.dev/v1/events").mock(
        return_value=httpx.Response(202, json={"accepted": 2})
    )

    await client.send_events(sample_events)

    assert route.called
    request = route.calls[0].request
    assert request.headers["authorization"] == "Bearer test-key-123"
    assert request.headers["content-type"] == "application/json"


@respx.mock
@pytest.mark.asyncio
async def test_send_events_failure_does_not_raise(client, sample_events):
    respx.post("https://api.raibench.dev/v1/events").mock(
        return_value=httpx.Response(500)
    )

    # Should not raise — fire and forget
    await client.send_events(sample_events)


@respx.mock
@pytest.mark.asyncio
async def test_send_events_network_error_does_not_raise(client, sample_events):
    respx.post("https://api.raibench.dev/v1/events").mock(
        side_effect=httpx.ConnectError("connection refused")
    )

    # Should not raise — graceful failure
    await client.send_events(sample_events)

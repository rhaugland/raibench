import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest

from raibench.monitor import Monitor


@pytest.fixture
def mock_client():
    with patch("raibench.monitor.RaiBenchClient") as mock:
        instance = mock.return_value
        instance.send_events = AsyncMock()
        yield instance


@pytest.fixture
def mon(mock_client):
    m = Monitor()
    m.init(api_key="test-key", pipeline="test-bot", category="support-qa")
    return m


def test_init_configures_monitor(mon):
    assert mon._pipeline_id == "test-bot"
    assert mon._category == "support-qa"


@pytest.mark.asyncio
async def test_trace_context_manager_records_event(mon):
    with mon.trace(stage="generation", provider="openai", model="gpt-4o") as span:
        await asyncio.sleep(0.01)

    assert span.event is not None
    assert span.event.pipeline_id == "test-bot"
    assert span.event.stage == "generation"
    assert span.event.provider == "openai"
    assert span.event.model == "gpt-4o"
    assert span.event.success is True
    assert span.event.latency_ms >= 10
    assert span.event.task_category == "support-qa"


@pytest.mark.asyncio
async def test_trace_records_failure_on_exception(mon):
    try:
        with mon.trace(stage="generation") as span:
            raise ValueError("something broke")
    except ValueError:
        pass

    assert span.event is not None
    assert span.event.success is False


@pytest.mark.asyncio
async def test_trace_decorator(mon):
    @mon.trace(stage="retrieval")
    async def search_docs(query: str):
        await asyncio.sleep(0.01)
        return ["doc1", "doc2"]

    result = await search_docs("test query")
    assert result == ["doc1", "doc2"]


def test_mark_failure(mon):
    with mon.trace(stage="generation") as span:
        mon.mark_failure(reason="hallucination_detected")

    assert span.event.success is False
    assert span.event.metadata["failure_reason"] == "hallucination_detected"

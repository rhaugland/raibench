import asyncio
from unittest.mock import AsyncMock

import pytest

from raibench.buffer import EventBuffer
from raibench.types import Event


@pytest.fixture
def sample_event():
    return Event(
        pipeline_id="test-bot",
        stage="generation",
        latency_ms=100,
        success=True,
    )


@pytest.mark.asyncio
async def test_buffer_batches_events(sample_event):
    sender = AsyncMock()
    buffer = EventBuffer(sender=sender, max_batch_size=3, flush_interval_ms=5000)

    buffer.add(sample_event)
    buffer.add(sample_event)
    buffer.add(sample_event)

    # Should auto-flush at batch size 3
    await asyncio.sleep(0.1)
    sender.assert_called_once()
    assert len(sender.call_args[0][0]) == 3


@pytest.mark.asyncio
async def test_buffer_flushes_on_interval(sample_event):
    sender = AsyncMock()
    buffer = EventBuffer(sender=sender, max_batch_size=100, flush_interval_ms=50)

    buffer.add(sample_event)

    # Should flush after 50ms even though batch isn't full
    await asyncio.sleep(0.15)
    sender.assert_called_once()
    assert len(sender.call_args[0][0]) == 1


@pytest.mark.asyncio
async def test_buffer_graceful_shutdown(sample_event):
    sender = AsyncMock()
    buffer = EventBuffer(sender=sender, max_batch_size=100, flush_interval_ms=5000)

    buffer.add(sample_event)
    buffer.add(sample_event)

    await buffer.shutdown()
    sender.assert_called_once()
    assert len(sender.call_args[0][0]) == 2

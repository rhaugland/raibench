from __future__ import annotations

import asyncio
import functools
import time
from typing import Any, Callable

from raibench.buffer import EventBuffer
from raibench.client import RaiBenchClient
from raibench.types import Event


class Span:
    def __init__(self, monitor: Monitor, stage: str, provider: str | None, model: str | None):
        self._monitor = monitor
        self._stage = stage
        self._provider = provider
        self._model = model
        self._start_time: float = 0
        self._success: bool = True
        self._metadata: dict[str, Any] = {}
        self.event: Event | None = None

    def _start(self) -> None:
        self._start_time = time.perf_counter()

    def _end(self) -> None:
        latency_ms = int((time.perf_counter() - self._start_time) * 1000)
        self.event = Event(
            pipeline_id=self._monitor._pipeline_id,
            stage=self._stage,
            provider=self._provider,
            model=self._model,
            latency_ms=latency_ms,
            success=self._success,
            task_category=self._monitor._category,
            metadata=self._metadata if self._metadata else None,
        )
        self._monitor._record(self.event)

    def mark_failure(self, reason: str) -> None:
        self._success = False
        self._metadata["failure_reason"] = reason


class Monitor:
    def __init__(self):
        self._pipeline_id: str = ""
        self._category: str | None = None
        self._buffer: EventBuffer | None = None
        self._client: RaiBenchClient | None = None
        self._current_span: Span | None = None
        self._initialized: bool = False

    def init(
        self,
        api_key: str,
        pipeline: str,
        category: str | None = None,
        api_url: str = "https://api.raibench.dev",
        max_batch_size: int = 50,
        flush_interval_ms: int = 5000,
    ) -> None:
        self._pipeline_id = pipeline
        self._category = category
        self._client = RaiBenchClient(api_url=api_url, api_key=api_key)
        self._buffer = EventBuffer(
            sender=self._client.send_events,
            max_batch_size=max_batch_size,
            flush_interval_ms=flush_interval_ms,
        )
        self._initialized = True

    def trace(
        self,
        stage: str,
        provider: str | None = None,
        model: str | None = None,
    ) -> _TraceContext:
        return _TraceContext(self, stage, provider, model)

    def mark_failure(self, reason: str) -> None:
        if self._current_span:
            self._current_span.mark_failure(reason)

    def _record(self, event: Event) -> None:
        if self._buffer:
            self._buffer.add(event)


class _TraceContext:
    """Supports both context manager and decorator usage."""

    def __init__(self, monitor: Monitor, stage: str, provider: str | None, model: str | None):
        self._monitor = monitor
        self._stage = stage
        self._provider = provider
        self._model = model
        self._span: Span | None = None

    @property
    def event(self) -> Event | None:
        return self._span.event if self._span else None

    def __enter__(self) -> Span:
        self._span = Span(self._monitor, self._stage, self._provider, self._model)
        self._span._start()
        self._monitor._current_span = self._span
        return self._span

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        if self._span:
            if exc_type is not None:
                self._span._success = False
            self._span._end()
            self._monitor._current_span = None
        return False

    def __call__(self, func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            with self as span:
                return await func(*args, **kwargs)

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            with self as span:
                return func(*args, **kwargs)

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper


monitor = Monitor()

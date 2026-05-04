from __future__ import annotations

import asyncio
import threading
from collections.abc import Callable, Coroutine
from typing import Any

from raibench.types import Event


class EventBuffer:
    def __init__(
        self,
        sender: Callable[[list[Event]], Coroutine[Any, Any, None]],
        max_batch_size: int = 50,
        flush_interval_ms: int = 5000,
    ):
        self._sender = sender
        self._max_batch_size = max_batch_size
        self._flush_interval_ms = flush_interval_ms
        self._buffer: list[Event] = []
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._flush_task: asyncio.Task | None = None
        self._start_flush_loop()

    def _start_flush_loop(self) -> None:
        try:
            self._loop = asyncio.get_running_loop()
            self._flush_task = self._loop.create_task(self._periodic_flush())
        except RuntimeError:
            pass

    async def _periodic_flush(self) -> None:
        while True:
            await asyncio.sleep(self._flush_interval_ms / 1000)
            await self._flush()

    def add(self, event: Event) -> None:
        flush_needed = False
        with self._lock:
            self._buffer.append(event)
            if len(self._buffer) >= self._max_batch_size:
                flush_needed = True

        if flush_needed and self._loop and self._loop.is_running():
            self._loop.create_task(self._flush())

    async def _flush(self) -> None:
        with self._lock:
            if not self._buffer:
                return
            batch = self._buffer[:]
            self._buffer = []
        await self._sender(batch)

    async def shutdown(self) -> None:
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        await self._flush()

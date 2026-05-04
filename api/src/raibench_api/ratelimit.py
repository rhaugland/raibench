"""In-memory sliding window rate limiter."""

from __future__ import annotations

import time
from collections import defaultdict

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP sliding window rate limiter.

    Limits:
      - /v1/events (ingest): 100 req/min
      - /v1/pipelines/*/suggestions: 10 req/min (expensive LLM calls)
      - Everything else: 60 req/min
    """

    def __init__(self, app):  # type: ignore[no-untyped-def]
        super().__init__(app)
        # {ip: [(timestamp, ...)]}
        self._windows: dict[str, list[float]] = defaultdict(list)
        self._last_cleanup = time.time()

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip health checks and badge endpoints
        path = request.url.path
        if path in ("/health", "/docs", "/openapi.json") or path.startswith("/badge/"):
            return await call_next(request)

        ip = request.client.host if request.client else "unknown"

        # Determine rate limit based on path
        if "/suggestions" in path:
            limit, window = 10, 60
            key = f"{ip}:suggestions"
        elif path == "/v1/events":
            limit, window = 100, 60
            key = f"{ip}:ingest"
        else:
            limit, window = 60, 60
            key = f"{ip}:general"

        now = time.time()

        # Cleanup old entries periodically
        if now - self._last_cleanup > 300:
            self._cleanup(now)
            self._last_cleanup = now

        # Trim window
        self._windows[key] = [t for t in self._windows[key] if now - t < window]

        if len(self._windows[key]) >= limit:
            return Response(
                content='{"detail":"Rate limit exceeded. Try again shortly."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(window)},
            )

        self._windows[key].append(now)
        return await call_next(request)

    def _cleanup(self, now: float) -> None:
        """Remove stale keys to prevent memory growth."""
        stale = [k for k, ts in self._windows.items() if not ts or now - ts[-1] > 120]
        for k in stale:
            del self._windows[k]

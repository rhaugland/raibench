"""Auto-patch OpenAI and Anthropic clients to trace all calls through RAIRCADE.

Usage:
    from raibench import monitor
    monitor.init(api_key="...", pipeline="my-app")

    from raibench.autopatch import patch
    patch()

    # Now every openai and anthropic call is automatically traced.
    # No @monitor.trace needed — just use the SDKs normally.

Or from CLI:
    raibench auto-patch --detect   # Shows what would be patched
    raibench auto-patch             # Prints setup code to paste
"""

from __future__ import annotations

import functools
import time
from typing import Any

_patched: set[str] = set()


def patch(providers: list[str] | None = None) -> list[str]:
    """Monkey-patch AI provider SDKs to auto-trace through RAIRCADE.

    Args:
        providers: List of providers to patch. If None, auto-detects installed ones.
                   Supported: "openai", "anthropic"

    Returns:
        List of provider names that were successfully patched.
    """
    patched = []

    targets = providers or _detect_providers()

    if "openai" in targets and "openai" not in _patched:
        if _patch_openai():
            patched.append("openai")
            _patched.add("openai")

    if "anthropic" in targets and "anthropic" not in _patched:
        if _patch_anthropic():
            patched.append("anthropic")
            _patched.add("anthropic")

    return patched


def unpatch() -> None:
    """Remove all monkey patches. Useful for testing."""
    if "openai" in _patched:
        _unpatch_openai()
        _patched.discard("openai")
    if "anthropic" in _patched:
        _unpatch_anthropic()
        _patched.discard("anthropic")


def _detect_providers() -> list[str]:
    """Detect which AI provider SDKs are installed."""
    found = []
    try:
        import openai  # noqa: F401
        found.append("openai")
    except ImportError:
        pass
    try:
        import anthropic  # noqa: F401
        found.append("anthropic")
    except ImportError:
        pass
    return found


# ─── Cost estimation (per 1M tokens) ───

_COST_PER_1M: dict[str, dict[str, float]] = {
    # model_prefix: {input: cents, output: cents}
    "gpt-4o-mini": {"input": 15, "output": 60},
    "gpt-4o": {"input": 250, "output": 1000},
    "gpt-4-turbo": {"input": 1000, "output": 3000},
    "gpt-3.5": {"input": 50, "output": 150},
    "claude-3-5-sonnet": {"input": 300, "output": 1500},
    "claude-sonnet-4": {"input": 300, "output": 1500},
    "claude-3-5-haiku": {"input": 80, "output": 400},
    "claude-haiku-4": {"input": 80, "output": 400},
    "claude-3-opus": {"input": 1500, "output": 7500},
    "claude-opus-4": {"input": 1500, "output": 7500},
}


def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float | None:
    """Estimate cost in cents from model name and token counts."""
    model_lower = model.lower()
    for prefix, rates in _COST_PER_1M.items():
        if prefix in model_lower:
            cost = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000
            return round(cost, 4)
    return None


# ─── OpenAI patching ───

_openai_originals: dict[str, Any] = {}


def _patch_openai() -> bool:
    try:
        from openai.resources.chat.completions import Completions, AsyncCompletions
    except ImportError:
        return False

    _openai_originals["sync_create"] = Completions.create
    _openai_originals["async_create"] = AsyncCompletions.create

    @functools.wraps(Completions.create)
    def sync_create(self: Any, *args: Any, **kwargs: Any) -> Any:
        from raibench.monitor import monitor
        if not monitor._initialized:
            return _openai_originals["sync_create"](self, *args, **kwargs)

        model = kwargs.get("model", args[0] if args else "unknown")
        start = time.perf_counter()
        try:
            result = _openai_originals["sync_create"](self, *args, **kwargs)
            latency_ms = int((time.perf_counter() - start) * 1000)
            _record_openai_event(monitor, model, latency_ms, True, result)
            return result
        except Exception as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            _record_openai_event(monitor, model, latency_ms, False, None, str(e))
            raise

    @functools.wraps(AsyncCompletions.create)
    async def async_create(self: Any, *args: Any, **kwargs: Any) -> Any:
        from raibench.monitor import monitor
        if not monitor._initialized:
            return await _openai_originals["async_create"](self, *args, **kwargs)

        model = kwargs.get("model", args[0] if args else "unknown")
        start = time.perf_counter()
        try:
            result = await _openai_originals["async_create"](self, *args, **kwargs)
            latency_ms = int((time.perf_counter() - start) * 1000)
            _record_openai_event(monitor, model, latency_ms, True, result)
            return result
        except Exception as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            _record_openai_event(monitor, model, latency_ms, False, None, str(e))
            raise

    Completions.create = sync_create  # type: ignore[assignment]
    AsyncCompletions.create = async_create  # type: ignore[assignment]
    return True


def _unpatch_openai() -> None:
    try:
        from openai.resources.chat.completions import Completions, AsyncCompletions
        if "sync_create" in _openai_originals:
            Completions.create = _openai_originals["sync_create"]  # type: ignore[assignment]
        if "async_create" in _openai_originals:
            AsyncCompletions.create = _openai_originals["async_create"]  # type: ignore[assignment]
        _openai_originals.clear()
    except ImportError:
        pass


def _record_openai_event(
    monitor: Any, model: str, latency_ms: int, success: bool,
    result: Any = None, error: str | None = None,
) -> None:
    from raibench.types import Event

    token_count = None
    cost_cents = None
    metadata: dict[str, Any] = {}

    if result and hasattr(result, "usage") and result.usage:
        input_tokens = result.usage.prompt_tokens or 0
        output_tokens = result.usage.completion_tokens or 0
        token_count = input_tokens + output_tokens
        cost_cents = _estimate_cost(model, input_tokens, output_tokens)
        metadata["input_tokens"] = input_tokens
        metadata["output_tokens"] = output_tokens

    if error:
        metadata["error"] = error

    event = Event(
        pipeline_id=monitor._pipeline_id,
        stage="generation",
        provider="openai",
        model=model,
        latency_ms=latency_ms,
        token_count=token_count,
        cost_cents=cost_cents,
        success=success,
        task_category=monitor._category,
        metadata=metadata if metadata else None,
    )
    monitor._record(event)


# ─── Anthropic patching ───

_anthropic_originals: dict[str, Any] = {}


def _patch_anthropic() -> bool:
    try:
        from anthropic.resources.messages import Messages, AsyncMessages
    except ImportError:
        return False

    _anthropic_originals["sync_create"] = Messages.create
    _anthropic_originals["async_create"] = AsyncMessages.create

    @functools.wraps(Messages.create)
    def sync_create(self: Any, *args: Any, **kwargs: Any) -> Any:
        from raibench.monitor import monitor
        if not monitor._initialized:
            return _anthropic_originals["sync_create"](self, *args, **kwargs)

        model = kwargs.get("model", "unknown")
        start = time.perf_counter()
        try:
            result = _anthropic_originals["sync_create"](self, *args, **kwargs)
            latency_ms = int((time.perf_counter() - start) * 1000)
            _record_anthropic_event(monitor, model, latency_ms, True, result)
            return result
        except Exception as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            _record_anthropic_event(monitor, model, latency_ms, False, None, str(e))
            raise

    @functools.wraps(AsyncMessages.create)
    async def async_create(self: Any, *args: Any, **kwargs: Any) -> Any:
        from raibench.monitor import monitor
        if not monitor._initialized:
            return await _anthropic_originals["async_create"](self, *args, **kwargs)

        model = kwargs.get("model", "unknown")
        start = time.perf_counter()
        try:
            result = await _anthropic_originals["async_create"](self, *args, **kwargs)
            latency_ms = int((time.perf_counter() - start) * 1000)
            _record_anthropic_event(monitor, model, latency_ms, True, result)
            return result
        except Exception as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            _record_anthropic_event(monitor, model, latency_ms, False, None, str(e))
            raise

    Messages.create = sync_create  # type: ignore[assignment]
    AsyncMessages.create = async_create  # type: ignore[assignment]
    return True


def _unpatch_anthropic() -> None:
    try:
        from anthropic.resources.messages import Messages, AsyncMessages
        if "sync_create" in _anthropic_originals:
            Messages.create = _anthropic_originals["sync_create"]  # type: ignore[assignment]
        if "async_create" in _anthropic_originals:
            AsyncMessages.create = _anthropic_originals["async_create"]  # type: ignore[assignment]
        _anthropic_originals.clear()
    except ImportError:
        pass


def _record_anthropic_event(
    monitor: Any, model: str, latency_ms: int, success: bool,
    result: Any = None, error: str | None = None,
) -> None:
    from raibench.types import Event

    token_count = None
    cost_cents = None
    metadata: dict[str, Any] = {}

    if result and hasattr(result, "usage") and result.usage:
        input_tokens = getattr(result.usage, "input_tokens", 0) or 0
        output_tokens = getattr(result.usage, "output_tokens", 0) or 0
        token_count = input_tokens + output_tokens
        cost_cents = _estimate_cost(model, input_tokens, output_tokens)
        metadata["input_tokens"] = input_tokens
        metadata["output_tokens"] = output_tokens

    if error:
        metadata["error"] = error

    event = Event(
        pipeline_id=monitor._pipeline_id,
        stage="generation",
        provider="anthropic",
        model=model,
        latency_ms=latency_ms,
        token_count=token_count,
        cost_cents=cost_cents,
        success=success,
        task_category=monitor._category,
        metadata=metadata if metadata else None,
    )
    monitor._record(event)

"""Tests for the autopatch module."""

from __future__ import annotations

from unittest.mock import MagicMock, patch as mock_patch
import pytest

from raibench.autopatch import (
    patch,
    unpatch,
    _detect_providers,
    _estimate_cost,
    _patched,
)


class TestEstimateCost:
    def test_gpt4o_mini(self):
        cost = _estimate_cost("gpt-4o-mini", 1000, 500)
        # 1000 * 15 / 1M + 500 * 60 / 1M = 0.015 + 0.03 = 0.045
        assert cost == 0.045

    def test_gpt4o(self):
        cost = _estimate_cost("gpt-4o", 1_000_000, 0)
        assert cost == 250.0

    def test_claude_sonnet(self):
        cost = _estimate_cost("claude-sonnet-4-20250514", 1000, 1000)
        # 1000 * 300 / 1M + 1000 * 1500 / 1M = 0.3 + 1.5 = 1.8
        assert cost == 1.8

    def test_unknown_model(self):
        assert _estimate_cost("llama-3", 100, 100) is None


class TestDetectProviders:
    def test_detects_installed(self):
        # Both openai and anthropic should be detectable if installed
        # This test just verifies the function runs without error
        result = _detect_providers()
        assert isinstance(result, list)


class TestPatchUnpatch:
    def setup_method(self):
        _patched.clear()

    def teardown_method(self):
        unpatch()
        _patched.clear()

    def test_patch_returns_list(self):
        # Patch with no providers installed returns empty or the installed ones
        result = patch(providers=[])
        assert result == []

    def test_patch_idempotent(self):
        """Patching twice should not double-patch."""
        # Force openai into _patched to simulate already patched
        _patched.add("openai")
        result = patch(providers=["openai"])
        assert "openai" not in result  # should skip already-patched

    def test_unpatch_clears(self):
        _patched.add("openai")
        _patched.add("anthropic")
        unpatch()
        assert len(_patched) == 0


class TestRecordOpenAIEvent:
    def test_records_event_with_usage(self):
        from raibench.autopatch import _record_openai_event

        mock_monitor = MagicMock()
        mock_monitor._initialized = True
        mock_monitor._pipeline_id = "test-pipe"
        mock_monitor._category = None

        mock_result = MagicMock()
        mock_result.usage.prompt_tokens = 100
        mock_result.usage.completion_tokens = 50

        _record_openai_event(mock_monitor, "gpt-4o-mini", 420, True, mock_result)

        mock_monitor._record.assert_called_once()
        event = mock_monitor._record.call_args[0][0]
        assert event.provider == "openai"
        assert event.model == "gpt-4o-mini"
        assert event.latency_ms == 420
        assert event.success is True
        assert event.token_count == 150
        assert event.cost_cents is not None

    def test_records_error(self):
        from raibench.autopatch import _record_openai_event

        mock_monitor = MagicMock()
        mock_monitor._pipeline_id = "test-pipe"
        mock_monitor._category = None

        _record_openai_event(mock_monitor, "gpt-4o", 100, False, None, "timeout")

        event = mock_monitor._record.call_args[0][0]
        assert event.success is False
        assert event.metadata["error"] == "timeout"


class TestRecordAnthropicEvent:
    def test_records_event_with_usage(self):
        from raibench.autopatch import _record_anthropic_event

        mock_monitor = MagicMock()
        mock_monitor._pipeline_id = "test-pipe"
        mock_monitor._category = None

        mock_result = MagicMock()
        mock_result.usage.input_tokens = 200
        mock_result.usage.output_tokens = 100

        _record_anthropic_event(mock_monitor, "claude-sonnet-4", 800, True, mock_result)

        event = mock_monitor._record.call_args[0][0]
        assert event.provider == "anthropic"
        assert event.model == "claude-sonnet-4"
        assert event.token_count == 300
        assert event.cost_cents is not None

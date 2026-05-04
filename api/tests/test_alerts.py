import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_detect_regression_when_success_rate_drops():
    """Test that a 30% drop in success rate is detected as regression."""
    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(return_value={
        "current_success_rate": 0.7,
        "previous_success_rate": 1.0,
        "current_count": 10,
        "previous_count": 10,
    })

    with patch("raibench_api.alerts.get_pool", AsyncMock(return_value=mock_pool)):
        from raibench_api.alerts import detect_regressions
        regressions = await detect_regressions("user-123", "alert-bot")

    assert len(regressions) == 1
    assert regressions[0]["type"] == "success_rate_drop"
    assert regressions[0]["current"] == pytest.approx(0.7, abs=0.01)
    assert regressions[0]["previous"] == pytest.approx(1.0, abs=0.01)


@pytest.mark.asyncio
async def test_no_regression_when_stable():
    """Test that stable success rate (same both days) produces no alerts."""
    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(return_value={
        "current_success_rate": 0.9,
        "previous_success_rate": 0.9,
        "current_count": 10,
        "previous_count": 10,
    })

    with patch("raibench_api.alerts.get_pool", AsyncMock(return_value=mock_pool)):
        from raibench_api.alerts import detect_regressions
        regressions = await detect_regressions("user-123", "stable-bot")

    assert len(regressions) == 0


@pytest.mark.asyncio
async def test_no_regression_with_insufficient_data():
    """Test that small sample sizes don't trigger false positives."""
    mock_pool = AsyncMock()
    mock_pool.fetchrow = AsyncMock(return_value={
        "current_success_rate": 0.5,
        "previous_success_rate": 1.0,
        "current_count": 3,  # Below threshold of 5
        "previous_count": 10,
    })

    with patch("raibench_api.alerts.get_pool", AsyncMock(return_value=mock_pool)):
        from raibench_api.alerts import detect_regressions
        regressions = await detect_regressions("user-123", "low-data-bot")

    assert len(regressions) == 0

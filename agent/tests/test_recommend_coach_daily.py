import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

from recommend_agent.main import RecommendRequest, _coach_plan_message, recommend_training

JST = ZoneInfo("Asia/Tokyo")


def _make_runner_event(text: str):
    event = MagicMock()
    event.is_final_response.return_value = True
    part = MagicMock()
    part.text = text
    content = MagicMock()
    content.parts = [part]
    event.content = content
    return event


def _async_iter(items):
    async def gen():
        for item in items:
            yield item

    return gen()


@pytest.mark.asyncio
async def test_coach_daily_uses_trigger_and_preserves_plan_context_key():
    request = RecommendRequest(
        goal="ftp_improvement",
        ftp=250,
        coach_autonomy="coach",
        plan_context_key="coach:2026-04-06:3:approved",
        activity_override={
            "activities": [],
            "fitness_metrics": {"ctl": 40, "atl": 45, "tsb": -5, "weekly_tss": 100},
            "last_updated": "2026-04-10T22:00:00+09:00",
            "schema": None,
        },
    )
    fake_runner = MagicMock()
    fake_runner.run_async.return_value = _async_iter(
        [_make_runner_event(json.dumps({"summary": "ok", "detail": "detail"}))]
    )
    fake_session = MagicMock()
    fake_session.id = "sid"

    with (
        patch("recommend_agent.main._load_cache", return_value=None),
        patch("recommend_agent.main._save_cache"),
        patch("recommend_agent.main._should_trigger_ambient", return_value=False),
        patch("recommend_agent.main._coach_plan_message", return_value=""),
        patch("recommend_agent.main._get_activity_cache", return_value=None),
        patch("recommend_agent.main._get_activity_cache_mtime", return_value=None),
        patch("recommend_agent.main.build_agent") as mock_build_agent,
        patch(
            "recommend_agent.main.session_service.create_session",
            new=AsyncMock(return_value=fake_session),
        ),
        patch("recommend_agent.main.Runner", return_value=fake_runner),
    ):
        response = await recommend_training(request)

    mock_build_agent.assert_called_once_with("hybrid", True, trigger="coach_daily")
    assert response.plan_context_key == "coach:2026-04-06:3:approved"


@pytest.mark.asyncio
async def test_cache_mismatch_on_plan_context_key_bypasses_cached_entry():
    request = RecommendRequest(
        goal="ftp_improvement",
        ftp=250,
        coach_autonomy="coach",
        plan_context_key="coach:2026-04-06:4:approved",
    )
    cached = {
        "summary": "cached",
        "detail": "cached detail",
        "created_at": "2026-04-16T00:00:00+00:00",
        "goal": "ftp_improvement",
        "mode": "hybrid",
        "use_personal_data": True,
        "ftp": 250,
        "coach_autonomy": "coach",
        "plan_context_key": "coach:2026-04-06:3:approved",
    }
    fake_runner = MagicMock()
    fake_runner.run_async.return_value = _async_iter(
        [_make_runner_event(json.dumps({"summary": "fresh", "detail": "detail"}))]
    )
    fake_session = MagicMock()
    fake_session.id = "sid"

    with (
        patch("recommend_agent.main._load_cache", return_value=cached),
        patch("recommend_agent.main._save_cache"),
        patch("recommend_agent.main._should_trigger_ambient", return_value=False),
        patch("recommend_agent.main._coach_plan_message", return_value=""),
        patch("recommend_agent.main._get_activity_cache", return_value=None),
        patch("recommend_agent.main._get_activity_cache_mtime", return_value=None),
        patch("recommend_agent.main.build_agent"),
        patch(
            "recommend_agent.main.session_service.create_session",
            new=AsyncMock(return_value=fake_session),
        ),
        patch("recommend_agent.main.Runner", return_value=fake_runner),
    ):
        response = await recommend_training(request)

    assert response.from_cache is False
    assert response.summary == "fresh"


def _stub_context(sessions: list[dict], source: str = "approved") -> dict:
    week = {
        "week_start": "2026-04-20",
        "phase": "build1",
        "plan_revision": 7,
        "sessions": sessions,
    }
    return {"source": source, "week": week, "sessions": sessions, "review": None}


def test_coach_plan_message_renders_multiple_today_sessions():
    sessions = [
        {
            "date": "2026-04-25",
            "type": "tempo",
            "duration_minutes": 90,
            "target_tss": 100,
            "origin": "baseline",
        },
        {
            "date": "2026-04-25",
            "type": "endurance",
            "duration_minutes": 60,
            "target_tss": 40,
            "origin": "appended",
        },
    ]
    with patch(
        "recommend_agent.main.current_session_context",
        return_value=_stub_context(sessions),
    ):
        message = _coach_plan_message(datetime(2026, 4, 25, 6, 0, tzinfo=JST))

    assert "today_sessions:" in message
    assert "(baseline) tempo / 90min / TSS 100" in message
    assert "(appended) endurance / 60min / TSS 40" in message
    assert "phase: build1" in message
    assert "plan_revision: 7" in message


def test_coach_plan_message_emits_rest_when_no_sessions_for_today():
    with patch(
        "recommend_agent.main.current_session_context",
        return_value=_stub_context([]),
    ):
        message = _coach_plan_message(datetime(2026, 4, 25, 6, 0, tzinfo=JST))

    assert "today_sessions: rest" in message


def test_coach_plan_message_returns_empty_when_no_context():
    with patch(
        "recommend_agent.main.current_session_context",
        return_value=None,
    ):
        message = _coach_plan_message(datetime(2026, 4, 25, 6, 0, tzinfo=JST))

    assert message == ""

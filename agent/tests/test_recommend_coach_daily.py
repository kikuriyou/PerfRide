import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

from recommend_agent.main import (
    RecommendRequest,
    _apply_recovery_guard,
    _coach_plan_message,
    _recommendation_recovery_policy,
    recommend_training,
)

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


def test_recovery_guard_caps_threshold_when_fatigue_alert_is_active():
    policy = _recommendation_recovery_policy(
        [{"type": "tsb_critical", "priority": "high", "data": {"tsb": -25}}]
    )
    guarded = _apply_recovery_guard(
        {
            "summary": "明日はThreshold",
            "detail": "hard",
            "workoutName": "Threshold 75min",
            "workout_intervals": [
                {"startMin": 0, "endMin": 75, "powerPercent": 95, "label": "Threshold"}
            ],
            "proposed_session": {
                "session_date": "2026-05-08",
                "session_type": "threshold",
                "duration_minutes": 75,
                "target_tss": 75,
            },
        },
        policy,
        "2026-05-08",
    )

    assert guarded["workoutName"] == "Recovery Ride"
    assert guarded["proposed_session"]["session_type"] == "recovery"  # type: ignore[index]
    assert max(i["powerPercent"] for i in guarded["workout_intervals"]) <= 60  # type: ignore[index]


def test_recovery_guard_uses_rest_when_tsb_is_severely_fatigued():
    policy = _recommendation_recovery_policy(
        [{"type": "tsb_critical", "priority": "high", "data": {"tsb": -31}}]
    )
    guarded = _apply_recovery_guard(
        {
            "summary": "明日はVO2max",
            "proposed_session": {
                "session_date": "2026-05-08",
                "session_type": "vo2max",
            },
        },
        policy,
        "2026-05-08",
    )

    assert guarded["workoutName"] == "Rest Day"
    assert guarded["proposed_session"]["session_type"] == "rest"  # type: ignore[index]
    assert guarded["totalDurationMin"] == 0


@pytest.mark.asyncio
async def test_recommend_training_caps_generated_threshold_when_safety_signal_active():
    request = RecommendRequest(
        goal="ftp_improvement",
        ftp=250,
        use_personal_data=True,
        activity_override={
            "activities": [],
            "fitness_metrics": {"ctl": 40, "atl": 65, "tsb": -25, "weekly_tss": 300},
            "last_updated": "2026-05-07T22:00:00+09:00",
            "schema": None,
        },
    )
    llm_json = json.dumps(
        {
            "summary": "明日はThreshold",
            "detail": "hard",
            "workoutName": "Threshold 75min",
            "workout_intervals": [
                {"startMin": 0, "endMin": 75, "powerPercent": 95, "label": "Threshold"}
            ],
            "proposed_session": {
                "session_date": "2026-05-08",
                "session_type": "threshold",
                "duration_minutes": 75,
                "target_tss": 75,
            },
        },
        ensure_ascii=False,
    )
    fake_runner = MagicMock()
    fake_runner.run_async.return_value = _async_iter([_make_runner_event(llm_json)])
    fake_session = MagicMock()
    fake_session.id = "sid"

    with (
        patch("recommend_agent.main._load_cache", return_value=None),
        patch("recommend_agent.main._save_cache"),
        patch("recommend_agent.main._should_trigger_ambient", return_value=False),
        patch("recommend_agent.main._get_activity_cache_mtime", return_value=None),
        patch("recommend_agent.main.build_agent"),
        patch(
            "recommend_agent.main.session_service.create_session",
            new=AsyncMock(return_value=fake_session),
        ),
        patch("recommend_agent.main.Runner", return_value=fake_runner),
    ):
        response = await recommend_training(request)

    assert response.workoutName == "Recovery Ride"
    assert response.proposed_session is not None
    assert response.proposed_session.session_type == "recovery"
    assert response.totalDurationMin == 45

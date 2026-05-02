from recommend_agent import main
from recommend_agent.tools import build_and_register_workout as workout


def test_webhook_registration_guard_falls_back_when_agent_did_not_call_tool(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_build_and_register_workout(**kwargs):
        calls.append(kwargs)
        return {
            "status": "success",
            "platform_status": "registered",
            "workout_id": "event-1",
            "session_date": "2026-05-04",
        }

    monkeypatch.setattr(workout, "build_and_register_workout", fake_build_and_register_workout)
    proposed = main.ProposedSession(
        session_date="2026-05-03",
        session_type="endurance",
        duration_minutes=90,
        target_tss=60,
        workout_id="hallucinated",
        registered=True,
    )
    request = main.WebhookRecommendRequest(user_id="u1", activity_id=123, trace_id="trace")

    result = main._ensure_webhook_workout_registration(
        proposed,
        request=request,
        profile={"ftp": 250},
        tool_result=None,
    )

    assert result is not None
    assert result.registered is True
    assert result.workout_id == "event-1"
    assert result.session_date == "2026-05-04"
    assert calls == [
        {
            "session_type": "endurance",
            "duration_minutes": 90,
            "ftp": 250,
            "target_tss": 60.0,
            "session_date": "2026-05-03",
            "workout_key": "webhook:123:2026-05-03:endurance",
        }
    ]


def test_webhook_registration_guard_uses_actual_tool_result(monkeypatch):
    def fail_if_called(**_kwargs):
        raise AssertionError("fallback registration should not run")

    monkeypatch.setattr(workout, "build_and_register_workout", fail_if_called)
    proposed = main.ProposedSession(
        session_date="2026-05-03",
        session_type="sweetspot",
        duration_minutes=75,
        target_tss=70,
        workout_id="hallucinated",
        registered=True,
    )
    request = main.WebhookRecommendRequest(user_id="u1", activity_id=123, trace_id="trace")

    result = main._ensure_webhook_workout_registration(
        proposed,
        request=request,
        profile={"ftp": 250},
        tool_result={
            "status": "success",
            "platform_status": "registered",
            "workout_id": "event-2",
            "session_date": "2026-05-04",
        },
    )

    assert result is not None
    assert result.registered is True
    assert result.workout_id == "event-2"
    assert result.session_date == "2026-05-04"

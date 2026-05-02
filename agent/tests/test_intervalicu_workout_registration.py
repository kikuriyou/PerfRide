from datetime import datetime
from unittest.mock import Mock, patch

from intervals_icu.client import IntervalsIcuDeployResult
from recommend_agent.tools._request_context import webhook_trace_id_var


def test_build_and_register_uses_intervals_icu(monkeypatch):
    monkeypatch.setenv("WORKOUT_PLATFORM", "intervals_icu")
    monkeypatch.setenv("INTERVALS_ICU_API_KEY", "secret")
    monkeypatch.setenv("INTERVALS_ICU_ATHLETE_ID", "0")
    mock_upsert = Mock(
        return_value=IntervalsIcuDeployResult(
            status="registered",
            message="OK",
            event_id="123",
            external_id="perfride:default:test-session",
        )
    )

    with (
        patch("intervals_icu.client.IntervalsIcuClient.upsert_workout", mock_upsert),
        patch(
            "recommend_agent.tools.build_and_register_workout._current_jst",
            return_value=datetime.fromisoformat("2026-05-02T10:00:00+09:00"),
        ),
    ):
        from recommend_agent.tools.build_and_register_workout import build_and_register_workout

        result = build_and_register_workout(
            session_type="vo2max",
            duration_minutes=60,
            ftp=260,
            session_date="2026-05-03",
            workout_key="test-session",
        )

    assert result["status"] == "success"
    assert result["platform"] == "intervals_icu"
    assert result["workout_id"] == "123"
    assert result["external_id"] == "perfride:default:test-session"
    event = mock_upsert.call_args.args[0]
    assert event["start_date_local"] == "2026-05-03T00:00:00"
    assert event["external_id"] == "perfride:default:test-session"
    assert event["target"] == "POWER"
    assert "112%" in event["description"]


def test_build_and_register_defaults_intervalicu_date_to_next_jst_day(monkeypatch):
    monkeypatch.setenv("WORKOUT_PLATFORM", "intervals_icu")
    monkeypatch.setenv("INTERVALS_ICU_API_KEY", "secret")
    mock_upsert = Mock(
        return_value=IntervalsIcuDeployResult(
            status="registered",
            message="OK",
            event_id=None,
            external_id="perfride:default:key",
        )
    )

    with (
        patch("intervals_icu.client.IntervalsIcuClient.upsert_workout", mock_upsert),
        patch(
            "recommend_agent.tools.build_and_register_workout._current_jst",
            return_value=datetime.fromisoformat("2026-05-02T23:30:00+09:00"),
        ),
    ):
        from recommend_agent.tools.build_and_register_workout import build_and_register_workout

        result = build_and_register_workout("recovery", 45, 260)

    assert result["session_date"] == "2026-05-03"
    assert mock_upsert.call_args.args[0]["start_date_local"] == "2026-05-03T00:00:00"


def test_build_and_register_clamps_past_non_webhook_date_to_today(monkeypatch):
    monkeypatch.setenv("WORKOUT_PLATFORM", "intervals_icu")
    monkeypatch.setenv("INTERVALS_ICU_API_KEY", "secret")
    mock_upsert = Mock(
        return_value=IntervalsIcuDeployResult(
            status="registered",
            message="OK",
            event_id="123",
            external_id="perfride:default:key",
        )
    )

    with (
        patch("intervals_icu.client.IntervalsIcuClient.upsert_workout", mock_upsert),
        patch(
            "recommend_agent.tools.build_and_register_workout._current_jst",
            return_value=datetime.fromisoformat("2026-05-03T06:00:00+09:00"),
        ),
    ):
        from recommend_agent.tools.build_and_register_workout import build_and_register_workout

        result = build_and_register_workout(
            "sweetspot",
            60,
            260,
            session_date="2026-05-02",
            workout_key="past-date",
        )

    assert result["session_date"] == "2026-05-03"
    assert mock_upsert.call_args.args[0]["start_date_local"] == "2026-05-03T00:00:00"


def test_build_and_register_clamps_webhook_date_to_next_jst_day(monkeypatch):
    monkeypatch.setenv("WORKOUT_PLATFORM", "intervals_icu")
    monkeypatch.setenv("INTERVALS_ICU_API_KEY", "secret")
    mock_upsert = Mock(
        return_value=IntervalsIcuDeployResult(
            status="registered",
            message="OK",
            event_id="123",
            external_id="perfride:default:webhook-date",
        )
    )
    trace_token = webhook_trace_id_var.set("trace-webhook")

    try:
        with (
            patch("intervals_icu.client.IntervalsIcuClient.upsert_workout", mock_upsert),
            patch(
                "recommend_agent.tools.build_and_register_workout._current_jst",
                return_value=datetime.fromisoformat("2026-05-03T06:00:00+09:00"),
            ),
        ):
            from recommend_agent.tools.build_and_register_workout import build_and_register_workout

            result = build_and_register_workout(
                "sweetspot",
                60,
                260,
                session_date="2026-05-03",
                workout_key="webhook-date",
            )
    finally:
        webhook_trace_id_var.reset(trace_token)

    assert result["session_date"] == "2026-05-04"
    assert mock_upsert.call_args.args[0]["start_date_local"] == "2026-05-04T00:00:00"


def test_build_and_register_skips_when_intervals_icu_credentials_missing(monkeypatch):
    monkeypatch.setenv("WORKOUT_PLATFORM", "intervals_icu")
    monkeypatch.delenv("INTERVALS_ICU_API_KEY", raising=False)

    from recommend_agent.tools import build_and_register_workout as workout

    monkeypatch.setattr(workout, "read_user_gcs_json", lambda *args, **kwargs: None)

    result = workout.build_and_register_workout("recovery", 45, 260)

    assert result["status"] == "skipped"
    assert result["platform_status"] == "skipped"
    assert "Intervals.icu API key" in result["platform_message"]


def test_build_and_register_reports_intervals_icu_failure(monkeypatch):
    monkeypatch.setenv("WORKOUT_PLATFORM", "intervals_icu")
    monkeypatch.setenv("INTERVALS_ICU_API_KEY", "secret")
    mock_upsert = Mock(
        return_value=IntervalsIcuDeployResult(
            status="failed",
            message="Intervals.icu request failed: HTTP 401",
        )
    )

    with patch("intervals_icu.client.IntervalsIcuClient.upsert_workout", mock_upsert):
        from recommend_agent.tools.build_and_register_workout import build_and_register_workout

        result = build_and_register_workout("sweetspot", 60, 260)

    assert result["status"] == "error"
    assert result["platform_status"] == "failed"
    assert "401" in result["platform_message"]


def test_build_and_register_unknown_platform_is_skipped(monkeypatch):
    monkeypatch.setenv("WORKOUT_PLATFORM", "unknown")

    from recommend_agent.tools.build_and_register_workout import build_and_register_workout

    result = build_and_register_workout("recovery", 45, 260)

    assert result["status"] == "skipped"
    assert result["platform_status"] == "skipped"
    assert "Unsupported workout platform" in result["platform_message"]

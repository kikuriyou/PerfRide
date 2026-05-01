from datetime import date

from recommend_agent.planner import generate_training_plan
from recommend_agent.weekly_logic import _has_valid_sequence


def test_goal_date_missing_falls_back_to_maintenance():
    plan = generate_training_plan(
        user_id="u1",
        goal_event="race",
        goal_date=None,
        reference_date=date(2026, 4, 6),
    )

    week = plan["weekly_plan"]["week_15"]
    assert plan["current_phase"] == "maintenance"
    assert week["phase"] == "maintenance"
    assert week["week_start"] == "2026-04-06"


def test_invalid_goal_date_falls_back_without_crashing():
    plan = generate_training_plan(
        user_id="u1",
        goal_event="race",
        goal_date="invalid",
        reference_date=date(2026, 4, 6),
    )

    assert plan["current_phase"] == "maintenance"
    assert plan["weekly_plan"]["week_15"]["phase"] == "maintenance"


def test_available_days_force_rest_on_unavailable_days():
    plan = generate_training_plan(
        user_id="u1",
        goal_event="race",
        goal_date="2026-06-01",
        available_days={
            "mon": {"available": False},
            "tue": {"available": True, "max_minutes": 45},
            "wed": {"available": False},
            "thu": {"available": True, "max_minutes": 60},
            "fri": {"available": False},
            "sat": {"available": True, "max_minutes": 120},
            "sun": {"available": True, "max_minutes": 90},
        },
        reference_date=date(2026, 4, 6),
    )

    week = plan["weekly_plan"]["week_15"]
    monday = next(session for session in week["sessions"] if session["date"] == "2026-04-06")
    wednesday = next(session for session in week["sessions"] if session["date"] == "2026-04-08")
    assert monday["type"] == "rest"
    assert wednesday["type"] == "rest"


def test_generated_sessions_have_baseline_origin():
    plan = generate_training_plan(
        user_id="u1",
        goal_event="race",
        goal_date="2026-06-01",
        reference_date=date(2026, 4, 6),
    )

    week = plan["weekly_plan"]["week_15"]
    assert all(session["origin"] == "baseline" for session in week["sessions"])


def _make_sessions(week_start: date, count: int = 7) -> list[dict]:
    from datetime import timedelta

    return [
        {
            "date": (week_start + timedelta(days=offset)).isoformat(),
            "type": "rest",
        }
        for offset in range(count)
    ]


def test_has_valid_sequence_accepts_seven_distinct_days():
    week_start = date(2026, 4, 6)
    week = {"sessions": _make_sessions(week_start, 7)}
    assert _has_valid_sequence(week, week_start) is True


def test_has_valid_sequence_accepts_baseline_plus_appended_on_same_date():
    """Appended sessions sit alongside baseline sessions; that pair must not invalidate."""
    week_start = date(2026, 4, 6)
    sessions = _make_sessions(week_start, 7)
    sessions.append(
        {
            "date": week_start.isoformat(),
            "type": "endurance",
            "origin": "appended",
        }
    )
    assert _has_valid_sequence({"sessions": sessions}, week_start) is True


def test_has_valid_sequence_rejects_multiple_baselines_on_same_date():
    """Two baseline-origin sessions on the same date corrupt the plan and must fail."""
    week_start = date(2026, 4, 6)
    sessions = _make_sessions(week_start, 7)
    sessions.append(
        {
            "date": week_start.isoformat(),
            "type": "endurance",
            # default origin is "baseline" via normalize_session_payload, but here we
            # exercise the validator directly so we encode the intent explicitly.
            "origin": "baseline",
        }
    )
    assert _has_valid_sequence({"sessions": sessions}, week_start) is False


def test_has_valid_sequence_rejects_missing_day():
    week_start = date(2026, 4, 6)
    sessions = _make_sessions(week_start, 6)  # missing Sunday
    assert _has_valid_sequence({"sessions": sessions}, week_start) is False


def test_has_valid_sequence_rejects_out_of_range_date():
    from datetime import timedelta

    week_start = date(2026, 4, 6)
    sessions = _make_sessions(week_start, 7)
    sessions[0] = {"date": (week_start - timedelta(days=1)).isoformat(), "type": "rest"}
    assert _has_valid_sequence({"sessions": sessions}, week_start) is False


def test_reference_date_keeps_output_deterministic():
    first = generate_training_plan(
        user_id="u1",
        goal_event="race",
        goal_date="2026-06-01",
        reference_date=date(2026, 4, 6),
    )
    second = generate_training_plan(
        user_id="u1",
        goal_event="race",
        goal_date="2026-06-01",
        reference_date=date(2026, 4, 6),
    )

    assert first["weekly_plan"]["week_15"]["phase"] == second["weekly_plan"]["week_15"]["phase"]


def test_current_session_context_returns_array_of_same_date_sessions():
    from datetime import date as _date
    from unittest.mock import patch

    from recommend_agent.weekly_logic import current_session_context

    week = {
        "week_start": "2026-04-20",
        "phase": "build1",
        "plan_revision": 5,
        "sessions": [
            {"date": "2026-04-25", "type": "tempo", "origin": "baseline"},
            {"date": "2026-04-25", "type": "endurance", "origin": "appended"},
            {"date": "2026-04-26", "type": "rest", "origin": "baseline"},
        ],
    }
    with patch(
        "recommend_agent.weekly_logic.current_plan_context",
        return_value={"source": "approved", "week": week, "review": None},
    ):
        result = current_session_context(_date(2026, 4, 25))

    assert result is not None
    assert result["source"] == "approved"
    assert isinstance(result["sessions"], list)
    assert len(result["sessions"]) == 2
    types = sorted(s["type"] for s in result["sessions"])
    assert types == ["endurance", "tempo"]


def test_current_session_context_returns_empty_array_when_no_sessions_today():
    from datetime import date as _date
    from unittest.mock import patch

    from recommend_agent.weekly_logic import current_session_context

    week = {
        "week_start": "2026-04-20",
        "phase": "build1",
        "plan_revision": 5,
        "sessions": [
            {"date": "2026-04-26", "type": "rest", "origin": "baseline"},
        ],
    }
    with patch(
        "recommend_agent.weekly_logic.current_plan_context",
        return_value={"source": "approved", "week": week, "review": None},
    ):
        result = current_session_context(_date(2026, 4, 25))

    assert result is not None
    assert result["sessions"] == []

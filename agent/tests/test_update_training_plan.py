from copy import deepcopy
from unittest.mock import patch

from recommend_agent.tools.update_training_plan import update_training_plan


def _make_plan() -> dict:
    return {
        "user_id": "u1",
        "plan_id": "plan_2026-04-24",
        "goal_event": "race",
        "current_phase": "build1",
        "phases": [],
        "weekly_plan": {
            "week_1": {
                "week_number": 1,
                "week_start": "2026-04-20",
                "phase": "build1",
                "target_tss": 125,
                "plan_revision": 3,
                "status": "approved",
                "sessions": [
                    {
                        "date": "2026-04-24",
                        "type": "recovery",
                        "duration_minutes": 45,
                        "target_tss": 25,
                        "status": "planned",
                        "origin": "baseline",
                    },
                    {
                        "date": "2026-04-25",
                        "type": "tempo",
                        "duration_minutes": 90,
                        "target_tss": 100,
                        "status": "planned",
                        "origin": "baseline",
                    },
                ],
            }
        },
        "updated_at": "2026-04-24T00:00:00+09:00",
        "updated_by": "planner",
    }


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-24T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_replace_updates_existing_session(mock_read_gen, mock_write, _mock_now):
    mock_read_gen.return_value = (deepcopy(_make_plan()), 1)

    result = update_training_plan(
        session_date="2026-04-25",
        session_type="threshold",
        duration_minutes=75,
        target_tss=85,
        status="registered",
        workout_id="PerfRide_20260425_threshold_abc.zwo",
    )

    assert result["status"] == "success"
    assert result["updated_session"]["type"] == "threshold"
    assert result["updated_session"]["origin"] == "baseline"

    written = mock_write.call_args.args[1]
    week = written["weekly_plan"]["week_1"]
    updated_session = next(s for s in week["sessions"] if s["date"] == "2026-04-25")
    assert updated_session["type"] == "threshold"
    assert updated_session["status"] == "registered"
    assert updated_session["workout_id"] == "PerfRide_20260425_threshold_abc.zwo"
    assert updated_session["planned_tss"] == 85
    assert week["target_tss"] == 110
    # Replace on approved week bumps plan_revision.
    assert week["plan_revision"] == 4


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-24T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation", return_value=(None, 0))
def test_replace_creates_record_schema_when_plan_missing(mock_read_gen, mock_write, _mock_now):
    result = update_training_plan(
        session_date="2026-04-26",
        session_type="endurance",
        duration_minutes=90,
        target_tss=55,
        status="planned",
    )

    assert result["status"] == "success"
    written = mock_write.call_args.args[1]
    assert "week_1" in written["weekly_plan"]
    sessions = written["weekly_plan"]["week_1"]["sessions"]
    assert len(sessions) == 1
    appended = sessions[0]
    assert appended["date"] == "2026-04-26"
    assert appended["origin"] == "baseline"
    assert appended["status"] == "planned"


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-24T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_append_adds_session_alongside_existing_baseline(mock_read_gen, mock_write, _mock_now):
    mock_read_gen.return_value = (deepcopy(_make_plan()), 1)

    result = update_training_plan(
        session_date="2026-04-25",
        session_type="endurance",
        duration_minutes=60,
        target_tss=40,
        status="planned",
        notes="optional second ride",
        mode="append",
    )

    assert result["status"] == "success"
    assert result["updated_session"]["origin"] == "appended"
    assert result["plan_revision"] == 4  # bumped from 3
    assert result["week_start"] == "2026-04-20"

    written = mock_write.call_args.args[1]
    sessions = written["weekly_plan"]["week_1"]["sessions"]
    same_date = [s for s in sessions if s["date"] == "2026-04-25"]
    assert len(same_date) == 2
    origins = sorted(s["origin"] for s in same_date)
    assert origins == ["appended", "baseline"]
    appended = next(s for s in same_date if s["origin"] == "appended")
    assert appended["notes"] == "optional second ride"


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-24T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_append_rejects_date_outside_existing_window(mock_read_gen, mock_write, _mock_now):
    mock_read_gen.return_value = (deepcopy(_make_plan()), 1)

    result = update_training_plan(
        session_date="2026-05-15",  # outside the only week (2026-04-20..04-26 implied)
        session_type="endurance",
        duration_minutes=60,
        target_tss=40,
        mode="append",
    )

    assert result["status"] == "error"
    assert "outside" in result["error_message"]
    # No write should have been issued for an out-of-range append.
    mock_write.assert_not_called()


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-24T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_append_returns_conflict_on_stale_plan_revision(mock_read_gen, mock_write, _mock_now):
    mock_read_gen.return_value = (deepcopy(_make_plan()), 1)

    result = update_training_plan(
        session_date="2026-04-25",
        session_type="endurance",
        duration_minutes=60,
        target_tss=40,
        mode="append",
        expected_plan_revision=2,  # mismatch (actual is 3)
    )

    assert result["status"] == "conflict"
    assert result["current_plan_revision"] == 3
    assert isinstance(result["current_sessions"], list)
    mock_write.assert_not_called()


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-24T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_replace_preserves_session_origin(mock_read_gen, mock_write, _mock_now):
    plan = _make_plan()
    plan["weekly_plan"]["week_1"]["sessions"][1]["origin"] = "appended"
    mock_read_gen.return_value = (plan, 1)

    update_training_plan(
        session_date="2026-04-25",
        session_type="threshold",
        duration_minutes=75,
        target_tss=85,
        status="registered",
    )

    written = mock_write.call_args.args[1]
    updated = next(
        s for s in written["weekly_plan"]["week_1"]["sessions"] if s["date"] == "2026-04-25"
    )
    assert updated["origin"] == "appended"


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-24T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_replace_with_target_origin_picks_appended_session(mock_read_gen, mock_write, _mock_now):
    """target_origin disambiguates which same-date session is updated."""
    plan = _make_plan()
    plan["weekly_plan"]["week_1"]["sessions"].append(
        {
            "date": "2026-04-25",
            "type": "endurance",
            "duration_minutes": 60,
            "target_tss": 40,
            "status": "planned",
            "origin": "appended",
        }
    )
    mock_read_gen.return_value = (plan, 1)

    update_training_plan(
        session_date="2026-04-25",
        session_type="endurance",
        duration_minutes=70,
        target_tss=45,
        status="registered",
        workout_id="appended_workout.zwo",
        target_origin="appended",
    )

    written = mock_write.call_args.args[1]
    same_date = [
        s for s in written["weekly_plan"]["week_1"]["sessions"] if s["date"] == "2026-04-25"
    ]
    assert len(same_date) == 2

    appended = next(s for s in same_date if s["origin"] == "appended")
    baseline = next(s for s in same_date if s["origin"] == "baseline")
    assert appended["status"] == "registered"
    assert appended["workout_id"] == "appended_workout.zwo"
    assert baseline["type"] == "tempo"
    assert baseline.get("workout_id") is None
    assert baseline["status"] == "planned"


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-24T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_replace_with_target_origin_baseline_skips_appended(mock_read_gen, mock_write, _mock_now):
    """target_origin='baseline' must update the baseline session even if appended comes first."""
    plan = _make_plan()
    plan["weekly_plan"]["week_1"]["sessions"].insert(
        1,
        {
            "date": "2026-04-25",
            "type": "endurance",
            "duration_minutes": 60,
            "target_tss": 40,
            "status": "planned",
            "origin": "appended",
        },
    )
    mock_read_gen.return_value = (plan, 1)

    update_training_plan(
        session_date="2026-04-25",
        session_type="threshold",
        duration_minutes=75,
        target_tss=85,
        status="registered",
        workout_id="baseline_workout.zwo",
        target_origin="baseline",
    )

    written = mock_write.call_args.args[1]
    same_date = [
        s for s in written["weekly_plan"]["week_1"]["sessions"] if s["date"] == "2026-04-25"
    ]
    baseline = next(s for s in same_date if s["origin"] == "baseline")
    appended = next(s for s in same_date if s["origin"] == "appended")
    assert baseline["status"] == "registered"
    assert baseline["workout_id"] == "baseline_workout.zwo"
    assert baseline["type"] == "threshold"
    assert appended["status"] == "planned"
    assert appended.get("workout_id") is None


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-24T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_replace_with_target_session_id_is_not_order_dependent(
    mock_read_gen, mock_write, _mock_now
):
    plan = _make_plan()
    plan["weekly_plan"]["week_1"]["sessions"][1]["session_id"] = "baseline:2026-04-20:2026-04-25"
    plan["weekly_plan"]["week_1"]["sessions"].insert(
        1,
        {
            "session_id": "appended:2026-04-20:2026-04-25:abc",
            "date": "2026-04-25",
            "type": "endurance",
            "duration_minutes": 60,
            "target_tss": 40,
            "status": "planned",
            "origin": "appended",
        },
    )
    mock_read_gen.return_value = (plan, 1)

    result = update_training_plan(
        session_date="2026-04-25",
        session_type="threshold",
        duration_minutes=75,
        target_tss=85,
        status="registered",
        target_session_id="baseline:2026-04-20:2026-04-25",
    )

    assert result["updated_session"]["session_id"] == "baseline:2026-04-20:2026-04-25"
    written = mock_write.call_args.args[1]
    sessions = written["weekly_plan"]["week_1"]["sessions"]
    same_date = [s for s in sessions if s["date"] == "2026-04-25"]
    appended = next(s for s in same_date if s["session_id"].startswith("appended:"))
    baseline = next(s for s in same_date if s["session_id"].startswith("baseline:"))
    assert appended["type"] == "endurance"
    assert baseline["type"] == "threshold"


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-26T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_append_works_when_target_week_has_only_partial_sessions(
    mock_read_gen, mock_write, _mock_now
):
    """A week-bucket that only carries one stale session must still accept
    an append for any other day inside its 7-day Monday-Sunday window.
    Regression: the old `_find_target_week_key` used min/max session dates,
    so a single leftover session collapsed the window and rejected legit
    same-week appends with 'outside the current weekly plan window'."""
    plan = {
        "user_id": "u1",
        "plan_id": "plan_2026-04-20",
        "goal_event": "race",
        "current_phase": "build1",
        "phases": [],
        "weekly_plan": {
            "week_1": {
                "week_number": 1,
                "week_start": "2026-04-20",
                "phase": "build1",
                "target_tss": 100,
                "plan_revision": 3,
                "status": "approved",
                "sessions": [
                    {
                        "date": "2026-04-25",
                        "type": "tempo",
                        "duration_minutes": 90,
                        "target_tss": 100,
                        "status": "planned",
                        "origin": "baseline",
                    },
                ],
            }
        },
        "updated_at": "2026-04-20T00:00:00+09:00",
        "updated_by": "planner",
    }
    mock_read_gen.return_value = (plan, 1)

    # Append on Sunday 2026-04-26 — same week as week_1 (mon 2026-04-20).
    result = update_training_plan(
        session_date="2026-04-26",
        session_type="endurance",
        duration_minutes=60,
        target_tss=40,
        mode="append",
    )

    assert result["status"] == "success"
    assert result["week_start"] == "2026-04-20"

    written = mock_write.call_args.args[1]
    sessions = written["weekly_plan"]["week_1"]["sessions"]
    appended = [s for s in sessions if s["date"] == "2026-04-26"]
    assert len(appended) == 1
    assert appended[0]["origin"] == "appended"


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-26T12:00:00+09:00",
)
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_append_still_rejects_truly_out_of_range_dates(mock_read_gen, mock_write, _mock_now):
    """The 7-day window must still reject dates that fall outside Mon–Sun."""
    plan = {
        "weekly_plan": {
            "week_1": {
                "week_number": 1,
                "week_start": "2026-04-20",
                "phase": "build1",
                "target_tss": 100,
                "plan_revision": 3,
                "status": "approved",
                "sessions": [
                    {
                        "date": "2026-04-20",
                        "type": "rest",
                        "duration_minutes": 0,
                        "target_tss": 0,
                        "status": "planned",
                        "origin": "baseline",
                    },
                ],
            }
        },
    }
    mock_read_gen.return_value = (plan, 1)

    result = update_training_plan(
        session_date="2026-04-27",  # Monday of the *next* week, no bucket exists.
        session_type="endurance",
        duration_minutes=60,
        target_tss=40,
        mode="append",
    )

    assert result["status"] == "error"
    assert "outside" in result["error_message"]

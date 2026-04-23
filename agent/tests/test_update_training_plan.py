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
                "phase": "build1",
                "target_tss": 125,
                "sessions": [
                    {
                        "date": "2026-04-24",
                        "type": "recovery",
                        "duration_minutes": 45,
                        "target_tss": 25,
                        "status": "planned",
                    },
                    {
                        "date": "2026-04-25",
                        "type": "tempo",
                        "duration_minutes": 90,
                        "target_tss": 100,
                        "status": "planned",
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
@patch("recommend_agent.tools.update_training_plan.write_gcs_json")
@patch("recommend_agent.tools.update_training_plan.read_gcs_json")
def test_updates_existing_session_in_record_schema(mock_read, mock_write, _mock_now):
    mock_read.return_value = deepcopy(_make_plan())

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
    assert "session_type" not in result["updated_session"]

    written = mock_write.call_args.args[1]
    week = written["weekly_plan"]["week_1"]
    updated_session = next(s for s in week["sessions"] if s["date"] == "2026-04-25")

    assert updated_session["type"] == "threshold"
    assert updated_session["status"] == "registered"
    assert updated_session["workout_id"] == "PerfRide_20260425_threshold_abc.zwo"
    assert week["target_tss"] == 110
    assert written["updated_by"] == "recommend_agent"
    assert written["updated_at"] == "2026-04-24T12:00:00+09:00"


@patch(
    "recommend_agent.tools.update_training_plan.now_jst_iso",
    return_value="2026-04-24T12:00:00+09:00",
)
@patch("recommend_agent.tools.update_training_plan.write_gcs_json")
@patch("recommend_agent.tools.update_training_plan.read_gcs_json", return_value=None)
def test_creates_record_schema_when_plan_missing(_mock_read, mock_write, _mock_now):
    result = update_training_plan(
        session_date="2026-04-26",
        session_type="endurance",
        duration_minutes=90,
        target_tss=55,
        status="planned",
    )

    assert result["status"] == "success"

    written = mock_write.call_args.args[1]
    assert isinstance(written["weekly_plan"], dict)
    assert "week_1" in written["weekly_plan"]
    assert written["weekly_plan"]["week_1"]["sessions"] == [
        {
            "date": "2026-04-26",
            "type": "endurance",
            "duration_minutes": 90,
            "target_tss": 55,
            "status": "planned",
            "updated_by": "recommend_agent",
            "updated_at": "2026-04-24T12:00:00+09:00",
        }
    ]

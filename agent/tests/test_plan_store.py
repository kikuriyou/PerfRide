from copy import deepcopy
from unittest.mock import patch

import pytest

from recommend_agent.gcs import OptimisticLockError
from recommend_agent.plan_store import (
    get_review,
    normalize_session_payload,
    replace_current_week,
    update_review_status,
    upsert_review,
)


def _draft_week() -> dict:
    return {
        "week_start": "2026-04-06",
        "week_number": 15,
        "phase": "build1",
        "target_tss": 125,
        "plan_revision": 3,
        "status": "pending",
        "sessions": [
            {
                "date": "2026-04-06",
                "type": "rest",
                "duration_minutes": 0,
                "target_tss": 0,
                "status": "planned",
            },
            {
                "date": "2026-04-07",
                "type": "tempo",
                "duration_minutes": 90,
                "target_tss": 125,
                "status": "planned",
            },
        ],
    }


@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation", return_value=(None, 0))
@patch("recommend_agent.plan_store.read_gcs_json", return_value=None)
def test_upsert_and_transition_review(_mock_read, mock_read_gen, mock_write):
    review = {
        "review_id": "weekly_2026-04-06",
        "week_start": "2026-04-06",
        "plan_revision": 3,
        "status": "pending",
        "draft": _draft_week(),
        "created_at": "2026-04-06T04:00:00+09:00",
    }

    upsert_review(review)
    upsert_payload = mock_write.call_args.args[1]
    assert upsert_payload["reviews"]["weekly_2026-04-06"]["status"] == "pending"
    # write was called with `if_generation_match=0` (object did not exist)
    assert mock_write.call_args.kwargs["if_generation_match"] == 0

    # Subsequent read returns the upserted store with bumped generation.
    mock_read_gen.return_value = (deepcopy(upsert_payload), 1)
    updated = update_review_status("weekly_2026-04-06", "dismissed", dismissed_at="now")

    assert updated is not None
    assert updated["status"] == "dismissed"
    assert updated["dismissed_at"] == "now"
    assert mock_write.call_args.kwargs["if_generation_match"] == 1


@patch("recommend_agent.plan_store.read_gcs_json", return_value=None)
def test_get_review_returns_none_when_missing(_mock_read):
    assert get_review("weekly_2026-04-06") is None


@patch("recommend_agent.plan_store.now_jst_iso", return_value="2026-04-06T04:00:00+09:00")
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation", return_value=(None, 0))
def test_replace_current_week_writes_approved_week(mock_read_gen, mock_write, _mock_now):
    replace_current_week(_draft_week(), user_id="u1", goal_event="race", current_phase="build1")

    written = mock_write.call_args.args[1]
    week = written["weekly_plan"]["week_15"]
    assert week["status"] == "approved"
    assert week["plan_revision"] == 3
    assert week["week_start"] == "2026-04-06"
    assert week["sessions"][1]["planned_tss"] == 125
    # All baseline-origin sessions should round-trip the origin field.
    assert all(session["origin"] == "baseline" for session in week["sessions"])
    assert mock_write.call_args.kwargs["if_generation_match"] == 0


@patch("recommend_agent.plan_store.now_jst_iso", return_value="2026-04-06T04:00:00+09:00")
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation")
def test_replace_current_week_retries_on_generation_conflict(mock_read_gen, mock_write, _mock_now):
    # Two conflicts then success.
    mock_read_gen.side_effect = [(None, 0), (None, 1), (None, 2)]
    mock_write.side_effect = [
        OptimisticLockError("conflict"),
        OptimisticLockError("conflict"),
        None,
    ]

    replace_current_week(_draft_week(), user_id="u1", goal_event="race")

    assert mock_write.call_count == 3
    assert mock_read_gen.call_count == 3
    # The final write used the last seen generation.
    assert mock_write.call_args.kwargs["if_generation_match"] == 2


@patch("recommend_agent.plan_store.now_jst_iso", return_value="2026-04-06T04:00:00+09:00")
@patch("recommend_agent.plan_store.write_gcs_json", side_effect=OptimisticLockError("conflict"))
@patch("recommend_agent.plan_store.read_gcs_json_with_generation", return_value=(None, 0))
def test_replace_current_week_raises_after_retry_limit(_mock_read, mock_write, _mock_now):
    with pytest.raises(OptimisticLockError):
        replace_current_week(_draft_week(), user_id="u1", goal_event="race")
    assert mock_write.call_count == 3  # DEFAULT_MAX_RETRIES


def test_normalize_session_payload_preserves_appended_origin():
    raw = {
        "date": "2026-04-06",
        "type": "endurance",
        "duration_minutes": 60,
        "target_tss": 50,
        "origin": "appended",
    }
    normalized = normalize_session_payload(raw)
    assert normalized is not None
    assert normalized["origin"] == "appended"


def test_normalize_session_payload_defaults_origin_to_baseline():
    raw = {
        "date": "2026-04-06",
        "type": "endurance",
        "duration_minutes": 60,
        "target_tss": 50,
    }
    normalized = normalize_session_payload(raw)
    assert normalized is not None
    assert normalized["origin"] == "baseline"


@patch("recommend_agent.plan_store.now_jst_iso", return_value="2026-04-06T04:00:00+09:00")
@patch("recommend_agent.plan_store.write_gcs_json")
@patch("recommend_agent.plan_store.read_gcs_json_with_generation", return_value=(None, 0))
def test_replace_current_week_allows_same_date_duplicate_sessions(
    mock_read_gen, mock_write, _mock_now
):
    week = _draft_week()
    week["sessions"].append(
        {
            "date": "2026-04-07",
            "type": "endurance",
            "duration_minutes": 60,
            "target_tss": 40,
            "status": "planned",
            "origin": "appended",
        }
    )

    replace_current_week(week, user_id="u1", goal_event="race")

    written = mock_write.call_args.args[1]
    sessions = written["weekly_plan"]["week_15"]["sessions"]
    same_date = [s for s in sessions if s["date"] == "2026-04-07"]
    assert len(same_date) == 2
    origins = sorted(s["origin"] for s in same_date)
    assert origins == ["appended", "baseline"]

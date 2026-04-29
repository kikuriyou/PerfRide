import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from recommend_agent.main import (
    WeeklyPlanAppendRequest,
    WeeklyPlanRequest,
    weekly_plan,
    weekly_plan_append,
)


def _week(plan_revision: int = 1) -> dict:
    return {
        "week_start": "2026-04-06",
        "week_number": 15,
        "phase": "build1",
        "target_tss": 70,
        "plan_revision": plan_revision,
        "status": "approved",
        "summary": "build1 week",
        "sessions": [
            {
                "date": "2026-04-06",
                "type": "rest",
                "duration_minutes": 0,
                "target_tss": 0,
            },
            {
                "date": "2026-04-07",
                "type": "tempo",
                "duration_minutes": 75,
                "target_tss": 70,
            },
        ],
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("coach_autonomy", ["suggest", "observe"])
async def test_weekly_plan_skips_when_coach_mode_off(coach_autonomy):
    with patch(
        "recommend_agent.main.get_user_profile",
        return_value={"status": "success", "profile": {"coach_autonomy": coach_autonomy}},
    ), patch("recommend_agent.main._run_weekly_agent", new=AsyncMock()) as mock_run, patch(
        "recommend_agent.main.replace_current_week"
    ) as mock_replace, patch(
        "recommend_agent.main.send_notification"
    ) as mock_notify, patch("recommend_agent.main.upsert_review") as mock_upsert:
        response = await weekly_plan(WeeklyPlanRequest(week_start="2026-04-06"))

    mock_run.assert_not_called()
    mock_replace.assert_not_called()
    mock_notify.assert_not_called()
    mock_upsert.assert_not_called()
    assert response.status == "skipped"
    assert response.week_start == "2026-04-06"


@pytest.mark.asyncio
async def test_weekly_plan_auto_applies_current_week_in_coach_mode():
    draft = _week(plan_revision=2)
    with (
        patch(
            "recommend_agent.main.get_user_profile",
            return_value={
                "status": "success",
                "profile": {
                    "coach_autonomy": "coach",
                    "user_id": "u1",
                    "goal": {"type": "ftp_improvement"},
                },
            },
        ),
        patch("recommend_agent.main.get_review", return_value=None),
        patch(
            "recommend_agent.main.load_training_plan",
            return_value={"weekly_plan": {"week_15": _week(plan_revision=1)}},
        ),
        patch("recommend_agent.main.build_baseline_week", return_value=draft),
        patch(
            "recommend_agent.main._run_weekly_agent",
            new=AsyncMock(return_value=("sid", '{"summary": "updated"}')),
        ),
        patch("recommend_agent.main.coerce_weekly_draft", return_value=draft),
        patch("recommend_agent.main.replace_current_week") as mock_replace,
        patch("recommend_agent.main.upsert_review") as mock_upsert,
        patch("recommend_agent.main.update_review_status") as mock_update_status,
        patch("recommend_agent.main.send_notification", return_value={"status": "success"})
        as mock_notify,
        patch("recommend_agent.main.update_training_plan") as mock_update,
        patch(
            "recommend_agent.tools.build_and_register_workout.build_and_register_workout"
        ) as mock_build,
    ):
        response = await weekly_plan(WeeklyPlanRequest(week_start="2026-04-06"))

    mock_replace.assert_called_once()
    assert mock_replace.call_args.args[0] == draft
    assert mock_replace.call_args.kwargs["expected_current_revision"] == 1
    assert mock_replace.call_args.kwargs["user_id"] == "u1"
    mock_upsert.assert_not_called()
    mock_update_status.assert_not_called()
    mock_update.assert_not_called()
    mock_build.assert_not_called()
    mock_notify.assert_called_once()
    assert mock_notify.call_args.kwargs["title"] == "今週のプランを更新しました"
    assert mock_notify.call_args.kwargs["actions"] == [{"id": "open_weekly_plan", "label": "見る"}]
    assert mock_notify.call_args.kwargs["metadata"]["page_path"] == "/weekly-plan"
    assert response.status == "applied"
    assert response.week_start == "2026-04-06"
    assert response.review_id is None
    assert response.plan_revision == 2
    assert response.sessions_planned == 1
    assert response.sessions_registered == 0
    assert response.session_id == "sid"


@pytest.mark.asyncio
async def test_weekly_plan_returns_applied_payload_with_fixed_week_start():
    with patch(
        "recommend_agent.main._create_or_update_weekly_review",
        new=AsyncMock(
            return_value={
                "status": "applied",
                "week_start": "2026-04-06",
                "review_id": "weekly_2026-04-06",
                "plan_revision": 1,
                "sessions_planned": 4,
                "sessions_registered": 0,
                "session_id": "sid",
            }
        ),
    ):
        response = await weekly_plan(
            WeeklyPlanRequest(
                week_start="2026-04-06",
                as_of="2026-04-06T04:00:00+09:00",
            )
        )

    assert response["status"] == "applied"
    assert response["review_id"] == "weekly_2026-04-06"


@pytest.mark.asyncio
async def test_weekly_plan_validates_week_start_is_monday():
    with pytest.raises(HTTPException):
        await weekly_plan(WeeklyPlanRequest(week_start="2026-04-07"))


@pytest.mark.asyncio
async def test_weekly_plan_append_returns_success_payload():
    appended_session = {
        "date": "2026-04-25",
        "type": "endurance",
        "duration_minutes": 60,
        "target_tss": 40,
        "origin": "appended",
    }
    with patch(
        "recommend_agent.main.update_training_plan",
        return_value={
            "status": "success",
            "updated_session": appended_session,
            "plan_revision": 4,
            "week_start": "2026-04-20",
        },
    ) as mock_update:
        response = await weekly_plan_append(
            WeeklyPlanAppendRequest(
                session_date="2026-04-25",
                session_type="endurance",
                duration_minutes=60,
                target_tss=40,
                expected_plan_revision=3,
            )
        )

    mock_update.assert_called_once()
    kwargs = mock_update.call_args.kwargs
    assert kwargs["mode"] == "append"
    assert kwargs["expected_plan_revision"] == 3

    assert response.status == "success"
    assert response.week_start == "2026-04-20"
    assert response.plan_revision == 4
    assert response.appended_session == appended_session


@pytest.mark.asyncio
async def test_weekly_plan_append_returns_conflict_payload():
    with patch(
        "recommend_agent.main.update_training_plan",
        return_value={
            "status": "conflict",
            "current_plan_revision": 5,
            "current_sessions": [{"date": "2026-04-25", "type": "tempo"}],
            "week_start": "2026-04-20",
            "error_message": "stale plan revision",
        },
    ):
        response = await weekly_plan_append(
            WeeklyPlanAppendRequest(
                session_date="2026-04-25",
                session_type="endurance",
                duration_minutes=60,
                target_tss=40,
                expected_plan_revision=3,
            )
        )

    assert response.status_code == 409
    payload = json.loads(response.body)
    assert payload["status"] == "conflict"
    assert payload["current_plan_revision"] == 5
    assert payload["message"] == "stale plan revision"


@pytest.mark.asyncio
async def test_weekly_plan_append_rejects_out_of_window_date():
    with (
        patch(
            "recommend_agent.main.update_training_plan",
            return_value={
                "status": "error",
                "error_message": (
                    "session_date 2026-05-15 is outside the current weekly plan window"
                ),
            },
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await weekly_plan_append(
            WeeklyPlanAppendRequest(
                session_date="2026-05-15",
                session_type="endurance",
                duration_minutes=60,
                target_tss=40,
                expected_plan_revision=3,
            )
        )

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_weekly_plan_append_returns_500_on_unexpected_error():
    with (
        patch(
            "recommend_agent.main.update_training_plan",
            return_value={"status": "error", "error_message": "boom"},
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await weekly_plan_append(
            WeeklyPlanAppendRequest(
                session_date="2026-04-25",
                session_type="endurance",
                duration_minutes=60,
                target_tss=40,
                expected_plan_revision=3,
            )
        )

    assert exc_info.value.status_code == 500

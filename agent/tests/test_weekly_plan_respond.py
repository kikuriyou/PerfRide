from unittest.mock import AsyncMock, patch

import pytest

from recommend_agent.main import (
    WeeklyPlanRespondRequest,
    _approve_weekly_review,
    weekly_plan_respond,
)


def _review() -> dict:
    return {
        "review_id": "weekly_2026-04-06",
        "week_start": "2026-04-06",
        "plan_revision": 3,
        "status": "pending",
        "draft": {
            "week_start": "2026-04-06",
            "week_number": 15,
            "phase": "build1",
            "target_tss": 100,
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
                    "duration_minutes": 75,
                    "target_tss": 70,
                    "status": "planned",
                },
            ],
        },
        "created_at": "2026-04-06T04:00:00+09:00",
    }


@pytest.mark.asyncio
async def test_approve_registers_non_rest_sessions_once():
    with (
        patch("recommend_agent.main.get_review", return_value=_review()),
        patch(
            "recommend_agent.main.get_user_profile",
            return_value={"status": "success", "profile": {"user_id": "u1", "ftp": 250}},
        ),
        patch("recommend_agent.main.replace_current_week") as mock_replace,
        patch("recommend_agent.main.update_training_plan") as mock_update,
        patch("recommend_agent.main.update_review_status"),
        patch(
            "recommend_agent.tools.build_and_register_workout.build_and_register_workout",
            return_value={"status": "success", "workout_id": "wid"},
        ),
    ):
        response = await _approve_weekly_review("weekly_2026-04-06", expected_plan_revision=3)

    mock_replace.assert_called_once()
    mock_update.assert_called_once()
    assert mock_update.call_args.kwargs["preserve_plan_revision"] is True
    assert response.status == "approved"
    assert response.sessions_registered == 1


@pytest.mark.asyncio
async def test_duplicate_approve_does_not_reapply():
    review = _review()
    review["applied_at"] = "2026-04-06T05:00:00+09:00"

    with patch("recommend_agent.main.get_review", return_value=review):
        response = await _approve_weekly_review("weekly_2026-04-06", expected_plan_revision=3)

    assert response.status == "approved"
    assert response.message == "already applied"


@pytest.mark.asyncio
async def test_weekly_respond_returns_conflict_on_stale_revision():
    with patch("recommend_agent.main.get_review", return_value=_review()):
        response = await weekly_plan_respond(
            WeeklyPlanRespondRequest(
                review_id="weekly_2026-04-06",
                action="approve",
                expected_plan_revision=2,
            )
        )

    assert response.status == "conflict"


@pytest.mark.asyncio
async def test_dismiss_has_no_apply_side_effect():
    with (
        patch("recommend_agent.main.get_review", return_value=_review()),
        patch("recommend_agent.main.update_review_status") as mock_update_status,
    ):
        response = await weekly_plan_respond(
            WeeklyPlanRespondRequest(
                review_id="weekly_2026-04-06",
                action="dismiss",
                expected_plan_revision=3,
            )
        )

    mock_update_status.assert_called_once()
    assert response.status == "dismissed"


@pytest.mark.asyncio
async def test_modify_increments_revision_via_regeneration():
    with (
        patch("recommend_agent.main.get_review", return_value=_review()),
        patch(
            "recommend_agent.main._create_or_update_weekly_review",
            new=AsyncMock(
                return_value={
                    "status": "modified",
                    "week_start": "2026-04-06",
                    "review_id": "weekly_2026-04-06",
                    "plan_revision": 4,
                    "sessions_planned": 1,
                    "sessions_registered": 0,
                    "session_id": "sid",
                }
            ),
        ),
    ):
        response = await weekly_plan_respond(
            WeeklyPlanRespondRequest(
                review_id="weekly_2026-04-06",
                action="modify",
                expected_plan_revision=3,
                user_message="木曜は短めで",
            )
        )

    assert response["status"] == "modified"
    assert response["plan_revision"] == 4

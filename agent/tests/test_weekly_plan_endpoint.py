from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from recommend_agent.main import (
    WeeklyPlanAppendRequest,
    WeeklyPlanRequest,
    weekly_plan,
    weekly_plan_append,
)


@pytest.mark.asyncio
async def test_weekly_plan_skips_when_coach_mode_off():
    with patch(
        "recommend_agent.main.get_user_profile",
        return_value={"status": "success", "profile": {"coach_autonomy": "suggest"}},
    ):
        response = await weekly_plan(WeeklyPlanRequest(week_start="2026-04-06"))

    assert response.status == "skipped"
    assert response.week_start == "2026-04-06"


@pytest.mark.asyncio
async def test_weekly_plan_creates_draft_with_fixed_week_start():
    with patch(
        "recommend_agent.main._create_or_update_weekly_review",
        new=AsyncMock(
            return_value={
                "status": "draft_created",
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

    assert response["status"] == "draft_created"
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

    assert response.status == "conflict"
    assert response.current_plan_revision == 5
    assert response.appended_session is None
    assert response.message == "stale plan revision"


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

from __future__ import annotations

import json
from datetime import datetime
from zoneinfo import ZoneInfo

from recommend_agent.local_scheduler import (
    already_ran_schedule,
    due_week_start_on_startup,
    next_scheduled_at,
    parse_day_of_week,
    read_state,
    scheduled_at_for_week,
    write_state,
)

JST = ZoneInfo("Asia/Tokyo")


def test_due_week_start_waits_until_configured_time():
    assert (
        due_week_start_on_startup(
            datetime(2026, 5, 4, 9, 59, tzinfo=JST),
            time_zone=JST,
            day_of_week=0,
            hour=10,
            minute=0,
        )
        is None
    )

    assert due_week_start_on_startup(
        datetime(2026, 5, 4, 10, 0, tzinfo=JST),
        time_zone=JST,
        day_of_week=0,
        hour=10,
        minute=0,
    ).isoformat() == "2026-05-04"


def test_next_scheduled_at_uses_next_monday_after_current_week_run_time():
    assert next_scheduled_at(
        datetime(2026, 5, 4, 9, 59, tzinfo=JST),
        time_zone=JST,
        day_of_week=0,
        hour=10,
        minute=0,
    ).isoformat() == "2026-05-04T10:00:00+09:00"

    assert next_scheduled_at(
        datetime(2026, 5, 4, 10, 0, tzinfo=JST),
        time_zone=JST,
        day_of_week=0,
        hour=10,
        minute=0,
    ).isoformat() == "2026-05-11T10:00:00+09:00"


def test_thursday_schedule_uses_current_week_monday_as_week_start():
    assert parse_day_of_week("thu") == 3
    assert scheduled_at_for_week(
        datetime(2026, 5, 4, tzinfo=JST).date(),
        time_zone=JST,
        day_of_week=3,
        hour=12,
        minute=15,
    ).isoformat() == "2026-05-07T12:15:00+09:00"

    assert (
        due_week_start_on_startup(
            datetime(2026, 5, 7, 12, 14, tzinfo=JST),
            time_zone=JST,
            day_of_week=3,
            hour=12,
            minute=15,
        )
        is None
    )

    assert due_week_start_on_startup(
        datetime(2026, 5, 7, 12, 15, tzinfo=JST),
        time_zone=JST,
        day_of_week=3,
        hour=12,
        minute=15,
    ).isoformat() == "2026-05-04"


def test_next_scheduled_at_uses_next_week_after_configured_day_time():
    assert next_scheduled_at(
        datetime(2026, 5, 7, 12, 14, tzinfo=JST),
        time_zone=JST,
        day_of_week=3,
        hour=12,
        minute=15,
    ).isoformat() == "2026-05-07T12:15:00+09:00"

    assert next_scheduled_at(
        datetime(2026, 5, 7, 12, 15, tzinfo=JST),
        time_zone=JST,
        day_of_week=3,
        hour=12,
        minute=15,
    ).isoformat() == "2026-05-14T12:15:00+09:00"


def test_state_round_trip(tmp_path):
    state_file = tmp_path / "weekly-plan-state.json"
    assert read_state(state_file) == {}

    scheduled_at = datetime(2026, 5, 7, 12, 15, tzinfo=JST)
    write_state(
        state_file,
        week_start=datetime(2026, 5, 4, tzinfo=JST).date(),
        scheduled_at=scheduled_at,
        ran_at=datetime(2026, 5, 4, 10, 0, tzinfo=JST),
        response={"status": "applied"},
    )

    assert already_ran_schedule(
        state_file,
        datetime(2026, 5, 4, tzinfo=JST).date(),
        scheduled_at,
    )
    assert not already_ran_schedule(
        state_file,
        datetime(2026, 5, 4, tzinfo=JST).date(),
        datetime(2026, 5, 7, 12, 20, tzinfo=JST),
    )
    assert json.loads(state_file.read_text(encoding="utf-8"))["last_response"] == {
        "status": "applied"
    }

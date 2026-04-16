"""Tests for `_summarize_recent_rides` and `_activity_jst_date` in main.py."""

from datetime import datetime
from zoneinfo import ZoneInfo

from recommend_agent.main import (
    _activity_jst_date,
    _summarize_recent_rides,
)

JST = ZoneInfo("Asia/Tokyo")


class TestActivityJstDate:
    def test_parses_z_suffixed_iso(self):
        # Strava returns start_date_local with trailing Z but content is JST local.
        assert _activity_jst_date("2026-04-15T18:30:00Z") == "2026-04-15"

    def test_parses_naive_iso(self):
        assert _activity_jst_date("2026-04-15T18:30:00") == "2026-04-15"

    def test_returns_none_for_empty(self):
        assert _activity_jst_date("") is None
        assert _activity_jst_date(None) is None  # type: ignore[arg-type]

    def test_returns_none_for_invalid(self):
        assert _activity_jst_date("not-a-date") is None
        assert _activity_jst_date("2026/04/15") is None


class TestSummarizeRecentRides:
    def test_all_three_days_have_rides(self):
        today = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        activities = [
            {
                "start_date_local": "2026-04-16T08:00:00Z",
                "name": "Morning Ride",
                "tss_estimated": 45,
                "intensity_factor": 0.70,
            },
            {
                "start_date_local": "2026-04-15T18:30:00Z",
                "name": "Zwift Race",
                "tss_estimated": 95,
                "intensity_factor": 0.92,
            },
            {
                "start_date_local": "2026-04-14T07:00:00Z",
                "name": "Recovery",
                "tss_estimated": 30,
                "intensity_factor": 0.55,
            },
        ]
        result = _summarize_recent_rides(activities, today)
        assert "今日 (2026-04-16): Morning Ride (TSS=45, IF=0.7)" in result
        assert "昨日 (2026-04-15): Zwift Race (TSS=95, IF=0.92)" in result
        assert "一昨日 (2026-04-14): Recovery (TSS=30, IF=0.55)" in result

    def test_yesterday_ride_detected_when_today_empty(self):
        """ユーザー報告の再現: 昨日に VirtualRide、今日はなし。"""
        today = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        activities = [
            {
                "start_date_local": "2026-04-15T18:30:00Z",
                "name": "Zwift",
                "tss_estimated": 60,
                "intensity_factor": 0.75,
            },
        ]
        result = _summarize_recent_rides(activities, today)
        assert "今日 (2026-04-16): ライドなし" in result
        assert "昨日 (2026-04-15): Zwift (TSS=60, IF=0.75)" in result
        assert "一昨日 (2026-04-14): ライドなし" in result

    def test_no_rides_at_all(self):
        today = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        result = _summarize_recent_rides([], today)
        assert "今日 (2026-04-16): ライドなし" in result
        assert "昨日 (2026-04-15): ライドなし" in result
        assert "一昨日 (2026-04-14): ライドなし" in result

    def test_intensity_factor_null_displays_na(self):
        today = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        activities = [
            {
                "start_date_local": "2026-04-15T18:30:00Z",
                "name": "HR-only Ride",
                "tss_estimated": 50,
                "intensity_factor": None,
            },
        ]
        result = _summarize_recent_rides(activities, today)
        assert "昨日 (2026-04-15): HR-only Ride (TSS=50, IF=N/A)" in result

    def test_ignores_rides_older_than_two_days(self):
        today = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        activities = [
            {
                "start_date_local": "2026-04-10T10:00:00Z",
                "name": "Old Ride",
                "tss_estimated": 80,
                "intensity_factor": 0.80,
            },
        ]
        result = _summarize_recent_rides(activities, today)
        assert "Old Ride" not in result
        assert result.count("ライドなし") == 3

    def test_multiple_rides_in_same_day(self):
        today = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        activities = [
            {
                "start_date_local": "2026-04-15T07:00:00Z",
                "name": "AM Ride",
                "tss_estimated": 40,
                "intensity_factor": 0.65,
            },
            {
                "start_date_local": "2026-04-15T19:00:00Z",
                "name": "PM Ride",
                "tss_estimated": 60,
                "intensity_factor": 0.85,
            },
        ]
        result = _summarize_recent_rides(activities, today)
        assert "AM Ride" in result
        assert "PM Ride" in result

    def test_as_of_anchors_today_label(self):
        as_of = datetime(2026, 4, 10, 23, 59, tzinfo=JST)
        activities = [
            {
                "start_date_local": "2026-04-10T08:00:00Z",
                "name": "AsOf Ride",
                "tss_estimated": 55,
                "intensity_factor": 0.72,
            },
            {
                "start_date_local": "2026-04-09T18:00:00Z",
                "name": "Prev Ride",
                "tss_estimated": 70,
                "intensity_factor": 0.80,
            },
        ]
        result = _summarize_recent_rides(activities, as_of)
        assert "今日 (2026-04-10): AsOf Ride" in result
        assert "昨日 (2026-04-09): Prev Ride" in result
        assert "一昨日 (2026-04-08): ライドなし" in result

    def test_future_rides_are_not_shown_with_earlier_as_of(self):
        as_of = datetime(2026, 4, 10, 23, 59, tzinfo=JST)
        activities = [
            {
                "start_date_local": "2026-04-15T08:00:00Z",
                "name": "Future Ride",
                "tss_estimated": 99,
                "intensity_factor": 0.95,
            },
        ]
        result = _summarize_recent_rides(activities, as_of)
        assert "Future Ride" not in result
        assert result.count("ライドなし") == 3

"""Tests for detect_signals rule-based signal detection."""

from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from recommend_agent.tools.detect_signals import (
    _check_long_gap,
    _check_new_pr,
    _check_recent_intensity_high,
    _check_tsb_critical,
    _check_weekly_tss_front_loaded,
    _check_weekly_tss_spike,
    detect_signals,
)

JST = ZoneInfo("Asia/Tokyo")


def _make_activity(
    days_ago: int,
    tss: float = 50,
    pr_count: int = 0,
    intensity_factor: float | None = None,
    moving_time_hours: float = 1.0,
) -> dict:
    date = datetime.now(JST) - timedelta(days=days_ago)
    return {
        "start_date_local": date.isoformat(),
        "tss_estimated": tss,
        "pr_count": pr_count,
        "name": f"Ride {days_ago}d ago",
        "intensity_factor": intensity_factor,
        "moving_time_hours": moving_time_hours,
    }


class TestTsbCritical:
    def test_triggered_when_tsb_below_threshold(self):
        result = _check_tsb_critical({"tsb": -30})
        assert result["triggered"] is True
        assert result["type"] == "tsb_critical"
        assert result["priority"] == "high"

    def test_triggered_at_boundary(self):
        result = _check_tsb_critical({"tsb": -25})
        assert result["triggered"] is True

    def test_not_triggered_above_threshold(self):
        result = _check_tsb_critical({"tsb": -24})
        assert result["triggered"] is False

    def test_not_triggered_positive_tsb(self):
        result = _check_tsb_critical({"tsb": 10})
        assert result["triggered"] is False

    def test_default_zero_when_missing(self):
        result = _check_tsb_critical({})
        assert result["triggered"] is False


class TestWeeklyTssSpike:
    def test_triggered_when_spike(self):
        now = datetime.now(JST)
        weekday = now.weekday()
        activities = [
            _make_activity(0, tss=200),
            _make_activity(7 + weekday, tss=80),
            _make_activity(14 + weekday, tss=80),
            _make_activity(21 + weekday, tss=80),
        ]
        result = _check_weekly_tss_spike(activities)
        assert result["triggered"] is True
        assert result["data"]["current_week_tss"] == 200.0

    def test_not_triggered_normal_load(self):
        now = datetime.now(JST)
        weekday = now.weekday()
        activities = [
            _make_activity(0, tss=80),
            _make_activity(7 + weekday, tss=80),
            _make_activity(14 + weekday, tss=80),
        ]
        result = _check_weekly_tss_spike(activities)
        assert result["triggered"] is False

    def test_not_triggered_no_past_data(self):
        activities = [_make_activity(0, tss=200)]
        result = _check_weekly_tss_spike(activities)
        assert result["triggered"] is False


class TestLongGap:
    def test_triggered_no_recent_activity(self):
        activities = [_make_activity(5, tss=50)]
        result = _check_long_gap(activities)
        assert result["triggered"] is True
        assert result["data"]["days_since_last"] >= 3

    def test_not_triggered_recent_activity(self):
        activities = [_make_activity(1, tss=50)]
        result = _check_long_gap(activities)
        assert result["triggered"] is False

    def test_triggered_empty_activities(self):
        result = _check_long_gap([])
        assert result["triggered"] is True

    def test_boundary_three_days(self):
        activities = [_make_activity(3, tss=50)]
        result = _check_long_gap(activities)
        assert result["triggered"] is True


class TestNewPr:
    def test_triggered_recent_pr(self):
        activities = [_make_activity(1, pr_count=2)]
        result = _check_new_pr(activities)
        assert result["triggered"] is True
        assert result["data"]["pr_count"] == 2

    def test_not_triggered_old_pr(self):
        activities = [_make_activity(5, pr_count=2)]
        result = _check_new_pr(activities)
        assert result["triggered"] is False

    def test_not_triggered_no_pr(self):
        activities = [_make_activity(1, pr_count=0)]
        result = _check_new_pr(activities)
        assert result["triggered"] is False


class TestWeeklyTssFrontLoaded:
    """月〜木に高負荷ライドが2本以上 = 過負荷警告として発火"""

    def test_triggered_two_hard_rides_in_front_half(self):
        now = datetime.now(JST)
        # 月曜と火曜に高負荷2本を確実に配置
        weekday = now.weekday()
        # 月〜木の範囲内にある日（days_ago）をweekdayから逆算
        day_mon = weekday  # 月曜
        day_tue = max(0, weekday - 1)  # 火曜（weekday>=1 の時）
        activities = [
            _make_activity(day_mon, tss=90, intensity_factor=0.90),
            _make_activity(day_tue, tss=90, intensity_factor=0.88),
        ]
        # 月曜 or 火曜のどちらかが過去 = weekday >= 1 のときだけ意味ある
        if weekday < 1:
            return  # 月曜0時台のエッジケースはスキップ
        result = _check_weekly_tss_front_loaded(activities)
        assert result["triggered"] is True
        assert result["data"]["hard_rides_front"] >= 2

    def test_not_triggered_single_hard_ride(self):
        now = datetime.now(JST)
        weekday = now.weekday()
        activities = [
            _make_activity(weekday, tss=90, intensity_factor=0.90),
            _make_activity(weekday, tss=40, intensity_factor=0.60),
        ]
        result = _check_weekly_tss_front_loaded(activities)
        assert result["triggered"] is False
        assert result["data"]["hard_rides_front"] == 1

    def test_fallback_tss_per_hour(self):
        """IF が欠落しているときは TSS/h >= 80 を高負荷として扱う。"""
        now = datetime.now(JST)
        weekday = now.weekday()
        if weekday < 1:
            return
        activities = [
            _make_activity(weekday, tss=90, intensity_factor=None, moving_time_hours=1.0),
            _make_activity(
                max(0, weekday - 1),
                tss=160,
                intensity_factor=None,
                moving_time_hours=2.0,
            ),
        ]
        result = _check_weekly_tss_front_loaded(activities)
        assert result["triggered"] is True
        assert result["data"]["hard_rides_front"] == 2

    def test_friday_or_later_rides_not_counted(self):
        """金曜以降の高負荷は「前半」扱いしない。"""
        now = datetime.now(JST)
        weekday = now.weekday()
        # 今日が金・土・日の時のみ意味があるケース
        if weekday < 4:
            return
        # 金曜以降の日にハードライドを2本置く
        friday_days_ago = weekday - 4
        activities = [
            _make_activity(friday_days_ago, tss=90, intensity_factor=0.90),
            _make_activity(friday_days_ago, tss=90, intensity_factor=0.90),
        ]
        result = _check_weekly_tss_front_loaded(activities)
        assert result["triggered"] is False
        assert result["data"]["hard_rides_front"] == 0

    def test_not_triggered_low_intensity_front_half(self):
        """前半に低強度を何本やっても発火しない。"""
        now = datetime.now(JST)
        weekday = now.weekday()
        if weekday < 1:
            return
        activities = [
            _make_activity(weekday, tss=50, intensity_factor=0.70),
            _make_activity(max(0, weekday - 1), tss=50, intensity_factor=0.70),
        ]
        result = _check_weekly_tss_front_loaded(activities)
        assert result["triggered"] is False
        assert result["data"]["hard_rides_front"] == 0


class TestRecentIntensityHigh:
    def test_triggered_when_two_hard_rides_in_3d(self):
        activities = [
            _make_activity(0, tss=90, intensity_factor=0.90),
            _make_activity(1, tss=85, intensity_factor=0.88),
        ]
        result = _check_recent_intensity_high(activities)
        assert result["triggered"] is True
        assert result["data"]["hard_rides_last_3d"] == 2
        assert result["priority"] == "high"

    def test_not_triggered_with_single_hard_ride(self):
        activities = [
            _make_activity(0, tss=90, intensity_factor=0.90),
            _make_activity(1, tss=40, intensity_factor=0.60),
        ]
        result = _check_recent_intensity_high(activities)
        assert result["triggered"] is False
        assert result["data"]["hard_rides_last_3d"] == 1

    def test_null_if_fallback_triggers_on_high_tss_per_hour(self):
        activities = [
            _make_activity(0, tss=90, intensity_factor=None, moving_time_hours=1.0),
            _make_activity(1, tss=160, intensity_factor=None, moving_time_hours=2.0),
        ]
        result = _check_recent_intensity_high(activities)
        assert result["triggered"] is True
        assert result["data"]["hard_rides_last_3d"] == 2

    def test_null_if_fallback_not_triggered_on_long_easy(self):
        activities = [
            _make_activity(0, tss=150, intensity_factor=None, moving_time_hours=3.0),
            _make_activity(1, tss=140, intensity_factor=None, moving_time_hours=3.0),
        ]
        result = _check_recent_intensity_high(activities)
        assert result["triggered"] is False

    def test_boundary_if_0_85(self):
        activities = [
            _make_activity(0, tss=90, intensity_factor=0.85),
            _make_activity(1, tss=85, intensity_factor=0.85),
        ]
        result = _check_recent_intensity_high(activities)
        assert result["triggered"] is True

        activities_below = [
            _make_activity(0, tss=90, intensity_factor=0.84),
            _make_activity(1, tss=85, intensity_factor=0.84),
        ]
        result_below = _check_recent_intensity_high(activities_below)
        assert result_below["triggered"] is False

    def test_older_rides_excluded(self):
        activities = [
            _make_activity(0, tss=90, intensity_factor=0.90),
            _make_activity(5, tss=90, intensity_factor=0.90),
        ]
        result = _check_recent_intensity_high(activities)
        assert result["data"]["hard_rides_last_3d"] == 1
        assert result["triggered"] is False


class TestDetectSignals:
    def test_returns_empty_when_no_cache(self):
        with patch(
            "recommend_agent.tools.detect_signals._load_activity_cache",
            return_value=None,
        ):
            result = detect_signals()
            assert result == []

    def test_returns_only_triggered(self):
        cache = {
            "activities": [_make_activity(0, tss=50)],
            "fitness_metrics": {"tsb": -30, "ctl": 50, "atl": 80, "weekly_tss": 200},
        }
        with patch(
            "recommend_agent.tools.detect_signals._load_activity_cache",
            return_value=cache,
        ):
            result = detect_signals()
            assert all(s["triggered"] for s in result)
            types = [s["type"] for s in result]
            assert "tsb_critical" in types

    def test_sorted_by_priority(self):
        cache = {
            "activities": [],
            "fitness_metrics": {"tsb": -30},
        }
        with patch(
            "recommend_agent.tools.detect_signals._load_activity_cache",
            return_value=cache,
        ):
            result = detect_signals()
            if len(result) >= 2:
                priorities = [s["priority"] for s in result]
                order = {"high": 0, "medium": 1, "low": 2}
                assert all(
                    order[priorities[i]] <= order[priorities[i + 1]]
                    for i in range(len(priorities) - 1)
                )


class TestNowInjection:
    """Injecting `now` should make detection results deterministic."""

    def _activity_at(self, iso_date: str, **kwargs) -> dict:
        return {
            "start_date_local": iso_date,
            "tss_estimated": kwargs.get("tss", 50),
            "pr_count": kwargs.get("pr_count", 0),
            "name": kwargs.get("name", "Ride"),
            "intensity_factor": kwargs.get("intensity_factor"),
            "moving_time_hours": kwargs.get("moving_time_hours", 1.0),
        }

    def test_long_gap_with_fixed_now(self):
        fixed_now = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        activities = [self._activity_at("2026-04-10T08:00:00")]
        result = _check_long_gap(activities, now=fixed_now)
        assert result["triggered"] is True
        assert result["data"]["days_since_last"] == 6

    def test_long_gap_with_earlier_now_not_triggered(self):
        fixed_now = datetime(2026, 4, 12, 10, 0, tzinfo=JST)
        activities = [self._activity_at("2026-04-10T08:00:00")]
        result = _check_long_gap(activities, now=fixed_now)
        assert result["triggered"] is False
        assert result["data"]["days_since_last"] == 2

    def test_new_pr_with_fixed_now(self):
        fixed_now = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        activities = [self._activity_at("2026-04-14T08:00:00", pr_count=2)]
        result = _check_new_pr(activities, now=fixed_now)
        assert result["triggered"] is True

    def test_new_pr_excluded_when_older_than_3d(self):
        fixed_now = datetime(2026, 4, 20, 10, 0, tzinfo=JST)
        activities = [self._activity_at("2026-04-14T08:00:00", pr_count=2)]
        result = _check_new_pr(activities, now=fixed_now)
        assert result["triggered"] is False

    def test_recent_intensity_high_with_future_filter(self):
        fixed_now = datetime(2026, 4, 14, 10, 0, tzinfo=JST)
        activities = [
            self._activity_at("2026-04-13T08:00:00", tss=90, intensity_factor=0.90),
            self._activity_at("2026-04-16T08:00:00", tss=90, intensity_factor=0.90),
        ]
        result = _check_recent_intensity_high(activities, now=fixed_now)
        assert result["data"]["hard_rides_last_3d"] == 1
        assert result["triggered"] is False

    def test_weekly_tss_spike_with_fixed_now(self):
        fixed_now = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        activities = [
            self._activity_at("2026-04-13T08:00:00", tss=200),
            self._activity_at("2026-04-06T08:00:00", tss=80),
            self._activity_at("2026-03-30T08:00:00", tss=80),
        ]
        result = _check_weekly_tss_spike(activities, now=fixed_now)
        assert result["triggered"] is True
        assert result["data"]["current_week_tss"] == 200.0

    def test_weekly_tss_front_loaded_with_fixed_now(self):
        fixed_now = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        activities = [
            self._activity_at("2026-04-13T08:00:00", tss=90, intensity_factor=0.90),
            self._activity_at("2026-04-14T08:00:00", tss=90, intensity_factor=0.90),
        ]
        result = _check_weekly_tss_front_loaded(activities, now=fixed_now)
        assert result["triggered"] is True
        assert result["data"]["hard_rides_front"] == 2


class TestDetectSignalsWithOverride:
    def test_override_bypasses_gcs(self):
        cache = {
            "activities": [
                {
                    "start_date_local": "2026-04-14T08:00:00",
                    "tss_estimated": 90,
                    "intensity_factor": 0.90,
                    "pr_count": 0,
                    "name": "Ride",
                    "moving_time_hours": 1.0,
                }
            ],
            "fitness_metrics": {"tsb": -30},
        }
        fixed_now = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        result = detect_signals(override=cache, as_of=fixed_now)
        types = [s["type"] for s in result]
        assert "tsb_critical" in types

    def test_as_of_filters_future_activities(self):
        cache = {
            "activities": [
                {
                    "start_date_local": "2026-04-10T08:00:00",
                    "tss_estimated": 50,
                    "pr_count": 0,
                    "name": "Past",
                    "intensity_factor": 0.70,
                    "moving_time_hours": 1.0,
                },
                {
                    "start_date_local": "2026-04-20T08:00:00",
                    "tss_estimated": 50,
                    "pr_count": 5,
                    "name": "Future",
                    "intensity_factor": 0.90,
                    "moving_time_hours": 1.0,
                },
            ],
            "fitness_metrics": {"tsb": 0},
        }
        fixed_now = datetime(2026, 4, 16, 10, 0, tzinfo=JST)
        result = detect_signals(override=cache, as_of=fixed_now)
        types = [s["type"] for s in result]
        assert "new_pr" not in types
        assert "long_gap" in types

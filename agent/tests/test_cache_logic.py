"""Tests for recommendation cache logic."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from recommend_agent.main import _should_regenerate

JST = ZoneInfo("Asia/Tokyo")


class TestShouldRegenerate:
    """Test cache regeneration decision logic (use_personal_data=True)."""

    def test_no_cache_should_regenerate(self):
        assert _should_regenerate(None, use_personal_data=True) is True

    @patch("recommend_agent.main._get_activity_cache_mtime")
    def test_same_day_no_change_uses_cache(self, mock_mtime):
        now = datetime.now(JST)
        mock_mtime.return_value = now
        cache = {
            "created_at": now.astimezone(UTC).isoformat(),
            "generation_date": now.strftime("%Y-%m-%d"),
            "generation_count": 1,
            "activity_cache_mtime": now.isoformat(),
        }
        assert _should_regenerate(cache, use_personal_data=True) is False

    @patch("recommend_agent.main._get_activity_cache_mtime")
    def test_data_changed_should_regenerate(self, mock_mtime):
        now = datetime.now(JST)
        old_time = now - timedelta(hours=2)
        mock_mtime.return_value = now

        cache = {
            "created_at": old_time.astimezone(UTC).isoformat(),
            "generation_date": now.strftime("%Y-%m-%d"),
            "generation_count": 1,
            "activity_cache_mtime": old_time.isoformat(),
        }
        assert _should_regenerate(cache, use_personal_data=True) is True

    @patch("recommend_agent.main._get_activity_cache_mtime")
    def test_daily_limit_reached(self, mock_mtime):
        now = datetime.now(JST)
        mock_mtime.return_value = now

        cache = {
            "created_at": now.astimezone(UTC).isoformat(),
            "generation_date": now.strftime("%Y-%m-%d"),
            "generation_count": 2,
            "activity_cache_mtime": (now - timedelta(hours=1)).isoformat(),
        }
        assert _should_regenerate(cache, use_personal_data=True) is False

    @patch("recommend_agent.main._get_activity_cache_mtime")
    def test_1_to_3_days_elapsed_regenerates(self, mock_mtime):
        now = datetime.now(JST)
        two_days_ago = now - timedelta(days=2)
        mock_mtime.return_value = two_days_ago

        cache = {
            "created_at": two_days_ago.astimezone(UTC).isoformat(),
            "generation_date": (now - timedelta(days=1)).strftime("%Y-%m-%d"),
            "generation_count": 1,
            "activity_cache_mtime": two_days_ago.isoformat(),
        }
        assert _should_regenerate(cache, use_personal_data=True) is True

    @patch("recommend_agent.main._get_activity_cache_mtime")
    def test_4_to_6_days_uses_cache(self, mock_mtime):
        now = datetime.now(JST)
        five_days_ago = now - timedelta(days=5)
        mock_mtime.return_value = five_days_ago

        cache = {
            "created_at": five_days_ago.astimezone(UTC).isoformat(),
            "generation_date": (now - timedelta(days=1)).strftime("%Y-%m-%d"),
            "generation_count": 0,
            "activity_cache_mtime": five_days_ago.isoformat(),
        }
        assert _should_regenerate(cache, use_personal_data=True) is False

    @patch("recommend_agent.main._get_activity_cache_mtime")
    def test_7_days_regenerates(self, mock_mtime):
        now = datetime.now(JST)
        seven_days_ago = now - timedelta(days=7)
        mock_mtime.return_value = seven_days_ago

        cache = {
            "created_at": seven_days_ago.astimezone(UTC).isoformat(),
            "generation_date": (now - timedelta(days=1)).strftime("%Y-%m-%d"),
            "generation_count": 0,
            "activity_cache_mtime": seven_days_ago.isoformat(),
        }
        assert _should_regenerate(cache, use_personal_data=True) is True

    @patch("recommend_agent.main._get_activity_cache_mtime")
    def test_8_plus_days_uses_cache(self, mock_mtime):
        now = datetime.now(JST)
        ten_days_ago = now - timedelta(days=10)
        mock_mtime.return_value = ten_days_ago

        cache = {
            "created_at": ten_days_ago.astimezone(UTC).isoformat(),
            "generation_date": (now - timedelta(days=1)).strftime("%Y-%m-%d"),
            "generation_count": 0,
            "activity_cache_mtime": ten_days_ago.isoformat(),
        }
        assert _should_regenerate(cache, use_personal_data=True) is False

    @patch("recommend_agent.main.datetime")
    @patch("recommend_agent.main._get_activity_cache_mtime")
    def test_jst_early_morning_yesterday_activity_is_1_day(self, mock_mtime, mock_dt):
        jst_now = datetime(2026, 3, 18, 8, 30, tzinfo=JST)
        mock_dt.now.return_value = jst_now

        activity_time = datetime(2026, 3, 17, 21, 0, tzinfo=JST)
        mock_mtime.return_value = activity_time

        cache = {
            "created_at": "2026-03-17 12:00:00",
            "generation_date": "2026-03-17",
            "generation_count": 1,
            "activity_cache_mtime": activity_time.isoformat(),
        }
        assert _should_regenerate(cache, use_personal_data=True) is True

    @patch("recommend_agent.main.datetime")
    @patch("recommend_agent.main._get_activity_cache_mtime")
    def test_jst_early_morning_same_day_activity_uses_cache(self, mock_mtime, mock_dt):
        jst_now = datetime(2026, 3, 18, 2, 0, tzinfo=JST)
        mock_dt.now.return_value = jst_now

        activity_time = datetime(2026, 3, 18, 0, 30, tzinfo=JST)
        mock_mtime.return_value = activity_time

        cache = {
            "created_at": "2026-03-17 15:30:00",
            "generation_date": "2026-03-18",
            "generation_count": 1,
            "activity_cache_mtime": activity_time.isoformat(),
        }
        assert _should_regenerate(cache, use_personal_data=True) is False


class TestShouldRegenerateNoPersonalData:
    """Test cache logic when use_personal_data=False."""

    def test_no_cache_should_regenerate(self):
        assert _should_regenerate(None, use_personal_data=False) is True

    def test_same_day_uses_cache(self):
        now = datetime.now(JST)
        cache = {
            "created_at": now.astimezone(UTC).isoformat(),
            "generation_date": now.strftime("%Y-%m-%d"),
            "generation_count": 1,
        }
        assert _should_regenerate(cache, use_personal_data=False) is False

    def test_next_day_regenerates(self):
        now = datetime.now(JST)
        yesterday = now - timedelta(days=1)
        cache = {
            "created_at": yesterday.astimezone(UTC).isoformat(),
            "generation_date": yesterday.strftime("%Y-%m-%d"),
            "generation_count": 1,
        }
        assert _should_regenerate(cache, use_personal_data=False) is True

    def test_daily_limit_still_respected(self):
        now = datetime.now(JST)
        cache = {
            "created_at": now.astimezone(UTC).isoformat(),
            "generation_date": now.strftime("%Y-%m-%d"),
            "generation_count": 2,
        }
        assert _should_regenerate(cache, use_personal_data=False) is False

    @patch("recommend_agent.main._get_activity_cache_mtime")
    def test_gcs_not_checked(self, mock_mtime):
        now = datetime.now(JST)
        cache = {
            "created_at": now.astimezone(UTC).isoformat(),
            "generation_date": now.strftime("%Y-%m-%d"),
            "generation_count": 1,
        }
        _should_regenerate(cache, use_personal_data=False)
        mock_mtime.assert_not_called()

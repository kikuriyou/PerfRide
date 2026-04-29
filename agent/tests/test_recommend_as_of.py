"""Tests for as_of-based cache bypass and activity_override propagation in /recommend."""

import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

from recommend_agent.main import (
    RecommendRequest,
    _get_activity_cache,
    _parse_as_of,
    recommend_training,
)
from recommend_agent.tools._request_context import (
    activity_override_var,
    as_of_var,
)
from recommend_agent.tools.detect_signals import detect_signals
from recommend_agent.tools.get_recent_activities import get_recent_activities

JST = ZoneInfo("Asia/Tokyo")


class TestParseAsOf:
    def test_none_returns_none(self):
        assert _parse_as_of(None) is None

    def test_empty_returns_none(self):
        assert _parse_as_of("") is None

    def test_naive_is_treated_as_jst(self):
        dt = _parse_as_of("2026-04-16T10:00:00")
        assert dt is not None
        assert dt.tzinfo is not None
        assert dt.hour == 10
        assert dt.utcoffset().total_seconds() == 9 * 3600  # type: ignore[union-attr]

    def test_invalid_returns_none(self):
        assert _parse_as_of("not-a-date") is None

    def test_date_only_compatible(self):
        dt = _parse_as_of("2026-04-16")
        assert dt is not None
        assert dt.year == 2026 and dt.month == 4 and dt.day == 16


class TestGetActivityCacheWithOverride:
    def test_override_short_circuits_gcs(self):
        override = {"activities": [{"name": "x"}], "fitness_metrics": {"tsb": -10}}
        with patch(
            "recommend_agent.main._load_activity_cache_json",
            return_value={"activities": [], "fitness_metrics": {}},
        ) as mock_load:
            result = _get_activity_cache(override)
            mock_load.assert_not_called()
            assert result == override

    def test_no_override_calls_gcs(self):
        with patch(
            "recommend_agent.main._load_activity_cache_json",
            return_value={"activities": [{"name": "gcs"}], "fitness_metrics": {}},
        ) as mock_load:
            result = _get_activity_cache(None)
            mock_load.assert_called_once()
            assert result is not None
            assert result["activities"][0]["name"] == "gcs"


class TestGetRecentActivitiesOverrideContext:
    def test_override_returns_data_without_gcs(self):
        override = {
            "activities": [{"name": "ctx ride"}],
            "fitness_metrics": {"tsb": 0},
            "last_updated": "2026-04-16T10:00:00+09:00",
            "schema": {"version": 1},
        }
        token = activity_override_var.set(override)
        try:
            with patch(
                "google.cloud.storage.Client",
                side_effect=AssertionError("GCS should not be called"),
            ):
                result = get_recent_activities()
        finally:
            activity_override_var.reset(token)
        assert result["status"] == "success"
        assert result["data"]["activities"][0]["name"] == "ctx ride"
        assert result["data"]["schema"] == {"version": 1}


class TestDetectSignalsOverridePath:
    def test_override_arg_bypasses_gcs(self):
        override = {
            "activities": [],
            "fitness_metrics": {"tsb": -30},
        }
        with patch(
            "recommend_agent.tools.detect_signals._load_activity_cache",
            side_effect=AssertionError("should not load from GCS"),
        ):
            result = detect_signals(override=override)
        types = [s["type"] for s in result]
        assert "tsb_critical" in types


@pytest.mark.asyncio
class TestRecommendHandlerAsOf:
    @staticmethod
    def _make_runner_event(text: str):
        event = MagicMock()
        event.is_final_response.return_value = True
        part = MagicMock()
        part.text = text
        content = MagicMock()
        content.parts = [part]
        event.content = content
        return event

    @staticmethod
    def _async_iter(items):
        async def gen():
            for it in items:
                yield it

        return gen()

    async def test_as_of_triggers_cache_bypass_and_no_save(self):
        request = RecommendRequest(
            goal="ftp_improvement",
            ftp=250,
            as_of="2026-04-10T22:00:00",
            activity_override={
                "activities": [],
                "fitness_metrics": {"ctl": 40, "atl": 45, "tsb": -5, "weekly_tss": 100},
                "last_updated": "2026-04-10T22:00:00+09:00",
                "schema": None,
            },
        )
        llm_json = json.dumps(
            {"summary": "ok", "detail": "detail text"},
            ensure_ascii=False,
        )
        fake_runner = MagicMock()
        fake_runner.run_async.return_value = self._async_iter([self._make_runner_event(llm_json)])
        fake_session = MagicMock()
        fake_session.id = "sid"

        with (
            patch("recommend_agent.main._load_cache") as mock_load_cache,
            patch("recommend_agent.main._save_cache") as mock_save_cache,
            patch("recommend_agent.main._should_regenerate") as mock_should_regenerate,
            patch("recommend_agent.main._should_trigger_ambient", return_value=False),
            patch("recommend_agent.main.build_agent"),
            patch(
                "recommend_agent.main.session_service.create_session",
                new=AsyncMock(return_value=fake_session),
            ),
            patch("recommend_agent.main.Runner", return_value=fake_runner),
        ):
            response = await recommend_training(request)

        mock_load_cache.assert_not_called()
        mock_save_cache.assert_not_called()
        mock_should_regenerate.assert_not_called()
        assert response.summary == "ok"
        assert response.from_cache is False
        as_of_dt = datetime(2026, 4, 10, 22, 0, tzinfo=JST)
        assert response.created_at.startswith(
            as_of_dt.astimezone(__import__("datetime").timezone.utc).isoformat()[:19]
        )

    async def test_no_as_of_uses_cache_path(self):
        request = RecommendRequest(goal="ftp_improvement", ftp=250)
        cached = {
            "summary": "cached",
            "detail": "cached detail",
            "created_at": "2026-04-16T00:00:00+00:00",
            "goal": "ftp_improvement",
            "mode": "quick",
            "use_personal_data": True,
            "ftp": 250,
            "workout_intervals": None,
            "totalDurationMin": None,
            "workoutName": None,
            "references": None,
            "why_now": None,
            "based_on": None,
        }
        with (
            patch("recommend_agent.main._load_cache", return_value=cached),
            patch("recommend_agent.main._should_regenerate", return_value=False) as mock_should,
            patch("recommend_agent.main._should_trigger_ambient", return_value=False),
            patch("recommend_agent.main.RECOMMEND_MODE", "quick"),
            patch("recommend_agent.main.USE_PERSONAL_DATA", True),
        ):
            response = await recommend_training(request)

        mock_should.assert_called_once()
        assert response.from_cache is True
        assert response.summary == "cached"

    async def test_as_of_reflected_in_user_message_and_contextvars(self):
        request = RecommendRequest(
            goal="ftp_improvement",
            ftp=250,
            as_of="2026-04-10T22:00:00",
            activity_override={
                "activities": [
                    {
                        "start_date_local": "2026-04-10T08:00:00Z",
                        "name": "AsOfRide",
                        "tss_estimated": 55,
                        "intensity_factor": 0.72,
                    }
                ],
                "fitness_metrics": {"ctl": 40, "atl": 45, "tsb": -5, "weekly_tss": 100},
                "last_updated": "2026-04-10T22:00:00+09:00",
                "schema": None,
            },
        )

        captured: dict[str, object] = {}

        async def fake_run(**kwargs):
            captured["user_message"] = kwargs["new_message"].parts[0].text
            captured["override_at_runtime"] = activity_override_var.get()
            captured["as_of_at_runtime"] = as_of_var.get()
            yield self._make_runner_event(
                json.dumps({"summary": "s", "detail": "d"}, ensure_ascii=False)
            )

        fake_runner = MagicMock()
        fake_runner.run_async.side_effect = lambda **kw: fake_run(**kw)
        fake_session = MagicMock()
        fake_session.id = "sid"

        with (
            patch("recommend_agent.main._save_cache"),
            patch("recommend_agent.main._should_trigger_ambient", return_value=False),
            patch("recommend_agent.main.build_agent"),
            patch(
                "recommend_agent.main.session_service.create_session",
                new=AsyncMock(return_value=fake_session),
            ),
            patch("recommend_agent.main.Runner", return_value=fake_runner),
        ):
            await recommend_training(request)

        msg = captured["user_message"]
        assert isinstance(msg, str)
        assert "2026-04-10" in msg
        assert "AsOfRide" in msg
        override_runtime = captured["override_at_runtime"]
        assert override_runtime is not None
        assert override_runtime["fitness_metrics"]["tsb"] == -5  # type: ignore[index]
        as_of_runtime = captured["as_of_at_runtime"]
        assert isinstance(as_of_runtime, datetime)
        assert as_of_runtime.year == 2026 and as_of_runtime.day == 10

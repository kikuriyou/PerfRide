"""Tests for the Zwift module: ZWO templates, generator, and build_and_register_workout."""

from datetime import datetime
from unittest.mock import patch

import pytest

from zwift.zwo_generator import generate_filename, generate_zwo
from zwift.zwo_templates import (
    ZwoInterval,
    endurance,
    estimate_tss,
    get_template,
    over_under,
    recovery,
    sprint,
    sweetspot,
    threshold,
    vo2max,
)


class TestZwoTemplates:
    def test_vo2max_75min(self):
        intervals = vo2max(75, 260)
        assert len(intervals) == 3
        assert intervals[0].type == "Warmup"
        assert intervals[1].type == "IntervalsT"
        assert intervals[1].repeat == 4
        assert intervals[1].on_duration == 240  # 4min
        assert intervals[1].on_power == 1.12
        assert intervals[2].type == "Cooldown"

    def test_vo2max_60min(self):
        intervals = vo2max(60, 260)
        assert intervals[1].repeat == 3
        assert intervals[1].on_duration == 240

    def test_vo2max_45min(self):
        intervals = vo2max(45, 260)
        assert intervals[1].repeat == 3
        assert intervals[1].on_duration == 180  # 3min

    def test_threshold(self):
        intervals = threshold(75, 260)
        assert intervals[1].power == 1.00
        assert intervals[1].label == "FTP 1"
        assert intervals[3].power == 1.00
        assert intervals[3].label == "FTP 2"

    def test_sweetspot_90min(self):
        intervals = sweetspot(90, 260)
        ss_blocks = [iv for iv in intervals if iv.power == 0.90]
        assert len(ss_blocks) == 3

    def test_sweetspot_60min(self):
        intervals = sweetspot(60, 260)
        ss_blocks = [iv for iv in intervals if iv.power == 0.90]
        assert len(ss_blocks) == 2

    def test_endurance(self):
        intervals = endurance(60, 260)
        assert intervals[1].power == 0.65
        assert intervals[1].label == "Endurance"

    def test_recovery(self):
        intervals = recovery(45, 260)
        assert len(intervals) == 1
        assert intervals[0].power == 0.50

    def test_over_under_60min(self):
        intervals = over_under(60, 260)
        over_blocks = [iv for iv in intervals if "Over" in iv.label]
        under_blocks = [iv for iv in intervals if "Under" in iv.label]
        assert len(over_blocks) == 3
        assert len(under_blocks) == 3

    def test_sprint(self):
        intervals = sprint(60, 260)
        assert intervals[1].type == "IntervalsT"
        assert intervals[1].on_power == 1.50
        assert intervals[1].on_duration == 30

    def test_get_template_valid(self):
        intervals = get_template("vo2max", 75, 260)
        assert len(intervals) > 0

    def test_get_template_invalid(self):
        with pytest.raises(ValueError, match="Unknown session type"):
            get_template("nonexistent", 60, 260)


class TestTssEstimation:
    def test_recovery_tss(self):
        intervals = recovery(45, 260)
        tss = estimate_tss(intervals, 260)
        assert 15 < tss < 40

    def test_vo2max_tss(self):
        intervals = vo2max(75, 260)
        tss = estimate_tss(intervals, 260)
        assert 60 < tss < 120

    def test_threshold_tss(self):
        intervals = threshold(75, 260)
        tss = estimate_tss(intervals, 260)
        assert 60 < tss < 110

    def test_endurance_tss(self):
        intervals = endurance(60, 260)
        tss = estimate_tss(intervals, 260)
        assert 30 < tss < 70

    def test_empty_intervals(self):
        tss = estimate_tss([], 260)
        assert tss == 0.0


class TestZwoGenerator:
    def test_generate_zwo_basic(self):
        intervals = [
            ZwoInterval("Warmup", 600, power_low=0.45, power_high=0.75, label="Warmup"),
            ZwoInterval("SteadyState", 1200, power=0.65, label="Endurance"),
            ZwoInterval("Cooldown", 300, power_low=0.60, power_high=0.45, label="Cooldown"),
        ]
        xml = generate_zwo("Test Workout", "Test description", intervals)
        assert "<workout_file>" in xml
        assert "<author>PerfRide</author>" in xml
        assert "<name>Test Workout</name>" in xml
        assert "Warmup" in xml
        assert "SteadyState" in xml
        assert "Cooldown" in xml

    def test_generate_zwo_intervals(self):
        intervals = [
            ZwoInterval(
                "IntervalsT",
                0,
                repeat=4,
                on_duration=240,
                off_duration=240,
                on_power=1.12,
                off_power=0.50,
                label="VO2max",
            ),
        ]
        xml = generate_zwo("VO2max", "Test", intervals)
        assert 'Repeat="4"' in xml
        assert 'OnDuration="240"' in xml
        assert 'OnPower="1.12"' in xml

    def test_generate_filename(self):
        filename = generate_filename("vo2max", "20260420", "some content")
        assert filename.startswith("PerfRide_20260420_vo2max_")
        assert filename.endswith(".zwo")
        assert len(filename) > 20

    def test_generate_filename_deterministic(self):
        f1 = generate_filename("vo2max", "20260420", "same content")
        f2 = generate_filename("vo2max", "20260420", "same content")
        assert f1 == f2

    def test_generate_filename_different_content(self):
        f1 = generate_filename("vo2max", "20260420", "content A")
        f2 = generate_filename("vo2max", "20260420", "content B")
        assert f1 != f2


class TestBuildAndRegisterWorkout:
    @patch("mywhoosh.client.MyWhooshClient.upload_workout")
    @patch("mywhoosh.client.MyWhooshClient.login")
    @patch("recommend_agent.tools.build_and_register_workout._current_jst")
    def test_success_mywhoosh(self, mock_now, mock_login, mock_upload):
        from mywhoosh.client import AuthSession, DeployResult

        mock_now.return_value = datetime.fromisoformat("2026-04-24T13:05:00+09:00")
        mock_login.return_value = AuthSession(access_token="fake", whoosh_id="id123")
        mock_upload.return_value = DeployResult(status="registered", message="OK")

        from recommend_agent.tools.build_and_register_workout import (
            build_and_register_workout,
        )

        result = build_and_register_workout(
            session_type="vo2max",
            duration_minutes=75,
            ftp=260,
        )

        assert result["status"] == "success"
        assert result["estimated_tss"] > 0
        assert "VO2max" in result["summary"]
        assert result["summary"].startswith("PerfRide 20260424-1305 ")
        assert result["base_summary"].startswith("VO2max")
        assert result["registered_at"] == "2026-04-24T13:05:00+09:00"
        assert result["platform_status"] == "registered"
        assert len(result["intervals"]) > 0
        uploaded_payload = mock_upload.call_args.args[0]
        assert uploaded_payload["Name"] == result["summary"]

    @patch("mywhoosh.client.MyWhooshClient.upload_workout")
    @patch("mywhoosh.client.MyWhooshClient.login")
    def test_deploy_failed_mywhoosh(self, mock_login, mock_upload):
        from mywhoosh.client import AuthSession, DeployResult

        mock_login.return_value = AuthSession(access_token="fake", whoosh_id="id123")
        mock_upload.return_value = DeployResult(status="failed", message="HTTP 401: Unauthorized")

        from recommend_agent.tools.build_and_register_workout import (
            build_and_register_workout,
        )

        result = build_and_register_workout(
            session_type="sweetspot",
            duration_minutes=90,
            ftp=260,
        )

        assert result["status"] == "error"
        assert result["platform_status"] == "failed"
        assert "401" in result["platform_message"]

    def test_invalid_session_type(self):
        from recommend_agent.tools.build_and_register_workout import (
            build_and_register_workout,
        )

        result = build_and_register_workout(
            session_type="invalid_type",
            duration_minutes=60,
            ftp=260,
        )

        assert result["status"] == "error"
        assert "Unknown session type" in result["error_message"]

    @patch("mywhoosh.client.MyWhooshClient.upload_workout")
    @patch("mywhoosh.client.MyWhooshClient.login")
    def test_alias_session_types_are_normalized(self, mock_login, mock_upload):
        from mywhoosh.client import AuthSession, DeployResult

        mock_login.return_value = AuthSession(access_token="fake", whoosh_id="id123")
        mock_upload.return_value = DeployResult(status="registered", message="OK")

        from recommend_agent.tools.build_and_register_workout import (
            build_and_register_workout,
        )

        aliases = [
            "Endurance Ride",
            "Endurance",
            "Zone 2",
            "Zone 2 Steady State",
            "Sweet Spot",
            "Recovery",
            "Recovery Ride",
            "VO2 Max",
            "Over-Under",
            "Race Simulation",
        ]

        for alias in aliases:
            result = build_and_register_workout(
                session_type=alias,
                duration_minutes=60,
                ftp=260,
            )
            assert result["status"] == "success", f"Failed for {alias}"
            assert result["platform_status"] == "registered", f"Not registered for {alias}"

    @patch("mywhoosh.client.MyWhooshClient.upload_workout")
    @patch("mywhoosh.client.MyWhooshClient.login")
    def test_all_session_types(self, mock_login, mock_upload):
        from mywhoosh.client import AuthSession, DeployResult

        mock_login.return_value = AuthSession(access_token="fake", whoosh_id="id123")
        mock_upload.return_value = DeployResult(status="registered", message="OK")

        from recommend_agent.tools.build_and_register_workout import (
            build_and_register_workout,
        )

        session_types = [
            "vo2max",
            "threshold",
            "sweetspot",
            "endurance",
            "recovery",
            "over_under",
            "tempo",
            "sprint",
            "race_simulation",
        ]
        for st in session_types:
            result = build_and_register_workout(
                session_type=st,
                duration_minutes=60,
                ftp=260,
            )
            assert result["status"] == "success", f"Failed for {st}"
            assert result["estimated_tss"] > 0, f"TSS=0 for {st}"

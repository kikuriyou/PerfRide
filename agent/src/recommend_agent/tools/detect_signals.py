"""Rule-based signal detection for insight cards."""

import json
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")

PRIORITY_MAP = {
    "tsb_critical": "high",
    "weekly_tss_spike": "high",
    "recent_intensity_high": "high",
    "long_gap": "medium",
    "new_pr": "medium",
    "weekly_tss_front_loaded": "medium",
}


def _load_activity_cache() -> dict | None:
    bucket_name = os.environ.get("GCS_BUCKET")
    if not bucket_name:
        return None
    try:
        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob("activity_cache.json")
        if not blob.exists():
            return None
        return json.loads(blob.download_as_text())
    except Exception:
        return None


def _check_tsb_critical(metrics: dict) -> dict:
    tsb = metrics.get("tsb", 0)
    return {
        "type": "tsb_critical",
        "triggered": tsb <= -25,
        "data": {"tsb": tsb},
        "priority": PRIORITY_MAP["tsb_critical"],
    }


def _check_weekly_tss_spike(activities: list[dict]) -> dict:
    now = datetime.now(JST)
    monday = now - timedelta(days=now.weekday())
    monday_start = monday.replace(hour=0, minute=0, second=0, microsecond=0)

    current_week_tss = 0.0
    past_weeks_tss: list[float] = []

    for act in activities:
        try:
            date_str = act.get("start_date_local", "")
            act_date = datetime.fromisoformat(date_str)
            if act_date.tzinfo is None:
                act_date = act_date.replace(tzinfo=JST)
            tss = act.get("tss_estimated", 0) or 0

            if act_date >= monday_start:
                current_week_tss += tss
            else:
                weeks_ago = (monday_start - act_date).days // 7
                if 0 <= weeks_ago < 4:
                    while len(past_weeks_tss) <= weeks_ago:
                        past_weeks_tss.append(0.0)
                    past_weeks_tss[weeks_ago] += tss
        except (ValueError, TypeError):
            continue

    avg_past = sum(past_weeks_tss) / len(past_weeks_tss) if past_weeks_tss else 0
    triggered = avg_past > 0 and current_week_tss > avg_past * 1.5

    return {
        "type": "weekly_tss_spike",
        "triggered": triggered,
        "data": {
            "current_week_tss": round(current_week_tss, 1),
            "avg_past_weeks_tss": round(avg_past, 1),
        },
        "priority": PRIORITY_MAP["weekly_tss_spike"],
    }


def _check_long_gap(activities: list[dict]) -> dict:
    now = datetime.now(JST)
    if not activities:
        return {
            "type": "long_gap",
            "triggered": True,
            "data": {"days_since_last": None},
            "priority": PRIORITY_MAP["long_gap"],
        }

    latest_date: datetime | None = None
    for act in activities:
        try:
            date_str = act.get("start_date_local", "")
            act_date = datetime.fromisoformat(date_str)
            if act_date.tzinfo is None:
                act_date = act_date.replace(tzinfo=JST)
            if latest_date is None or act_date > latest_date:
                latest_date = act_date
        except (ValueError, TypeError):
            continue

    if latest_date is None:
        return {
            "type": "long_gap",
            "triggered": True,
            "data": {"days_since_last": None},
            "priority": PRIORITY_MAP["long_gap"],
        }

    days_since = (now - latest_date).days
    return {
        "type": "long_gap",
        "triggered": days_since >= 3,
        "data": {"days_since_last": days_since},
        "priority": PRIORITY_MAP["long_gap"],
    }


def _check_new_pr(activities: list[dict]) -> dict:
    now = datetime.now(JST)
    recent_cutoff = now - timedelta(days=3)

    for act in activities:
        try:
            date_str = act.get("start_date_local", "")
            act_date = datetime.fromisoformat(date_str)
            if act_date.tzinfo is None:
                act_date = act_date.replace(tzinfo=JST)
            if act_date < recent_cutoff:
                continue
            if act.get("pr_count", 0) and act["pr_count"] > 0:
                return {
                    "type": "new_pr",
                    "triggered": True,
                    "data": {
                        "activity_name": act.get("name", ""),
                        "pr_count": act["pr_count"],
                    },
                    "priority": PRIORITY_MAP["new_pr"],
                }
        except (ValueError, TypeError):
            continue

    return {
        "type": "new_pr",
        "triggered": False,
        "data": {},
        "priority": PRIORITY_MAP["new_pr"],
    }


def _check_recent_intensity_high(activities: list[dict]) -> dict:
    now = datetime.now(JST)
    cutoff = now - timedelta(days=3)

    hard_count = 0
    for act in activities:
        try:
            date_str = act.get("start_date_local", "")
            act_date = datetime.fromisoformat(date_str)
            if act_date.tzinfo is None:
                act_date = act_date.replace(tzinfo=JST)
            if act_date < cutoff:
                continue

            intensity_factor = act.get("intensity_factor")
            if intensity_factor is not None:
                if intensity_factor >= 0.85:
                    hard_count += 1
                continue

            tss = act.get("tss_estimated", 0) or 0
            hours = act.get("moving_time_hours", 0) or 0
            if hours > 0 and (tss / hours) >= 80:
                hard_count += 1
        except (ValueError, TypeError, ZeroDivisionError):
            continue

    return {
        "type": "recent_intensity_high",
        "triggered": hard_count >= 2,
        "data": {"hard_rides_last_3d": hard_count},
        "priority": PRIORITY_MAP["recent_intensity_high"],
    }


def _check_weekly_tss_front_loaded(activities: list[dict]) -> dict:
    now = datetime.now(JST)
    monday = now - timedelta(days=now.weekday())
    monday_start = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    thursday_end = monday_start + timedelta(days=4)

    hard_count = 0
    for act in activities:
        try:
            date_str = act.get("start_date_local", "")
            act_date = datetime.fromisoformat(date_str)
            if act_date.tzinfo is None:
                act_date = act_date.replace(tzinfo=JST)
            if act_date < monday_start or act_date >= thursday_end:
                continue

            intensity_factor = act.get("intensity_factor")
            if intensity_factor is not None:
                if intensity_factor >= 0.85:
                    hard_count += 1
                continue

            tss = act.get("tss_estimated", 0) or 0
            hours = act.get("moving_time_hours", 0) or 0
            if hours > 0 and (tss / hours) >= 80:
                hard_count += 1
        except (ValueError, TypeError, ZeroDivisionError):
            continue

    triggered = hard_count >= 2

    return {
        "type": "weekly_tss_front_loaded",
        "triggered": triggered,
        "data": {"hard_rides_front": hard_count},
        "priority": PRIORITY_MAP["weekly_tss_front_loaded"],
    }


def detect_signals() -> list[dict]:
    """Run all signal detection rules against activity_cache.json from GCS.

    Returns a list of signal dicts, each with: type, triggered, data, priority.
    Only triggered signals are included in the result.
    """
    cache = _load_activity_cache()
    if cache is None:
        return []

    activities = cache.get("activities", [])
    metrics = cache.get("fitness_metrics", {})

    all_signals = [
        _check_tsb_critical(metrics),
        _check_weekly_tss_spike(activities),
        _check_recent_intensity_high(activities),
        _check_long_gap(activities),
        _check_new_pr(activities),
        _check_weekly_tss_front_loaded(activities),
    ]

    triggered = [s for s in all_signals if s["triggered"]]

    priority_order = {"high": 0, "medium": 1, "low": 2}
    triggered.sort(key=lambda s: priority_order.get(s["priority"], 99))

    return triggered

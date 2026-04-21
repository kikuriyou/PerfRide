from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo

from zwift.zwo_templates import estimate_tss, get_template

JST = ZoneInfo("Asia/Tokyo")

WORKOUT_PLATFORM = os.environ.get("WORKOUT_PLATFORM", "mywhoosh")  # "zwift" | "mywhoosh"

_SESSION_LABELS: dict[str, str] = {
    "vo2max": "VO2max",
    "threshold": "Threshold",
    "sweetspot": "Sweet Spot",
    "endurance": "Endurance",
    "recovery": "Recovery",
    "over_under": "Over/Under",
    "tempo": "Tempo",
    "sprint": "Sprint",
    "race_simulation": "Race Sim",
}


def _build_interval_name(session_type: str, intervals: list) -> str:
    label = _SESSION_LABELS.get(session_type, session_type)
    for iv in intervals:
        if iv.type == "IntervalsT" and iv.repeat and iv.on_duration:
            on_min = iv.on_duration // 60
            return f"{label} {iv.repeat}x{on_min}min"
        if iv.type == "SteadyState" and iv.label and iv.label != "Rest":
            dur_min = iv.duration_seconds // 60
            return f"{label} {dur_min}min"
    return label


def _format_intervals(intervals: list) -> list[dict]:
    result: list[dict] = []
    cursor_min = 0.0
    for iv in intervals:
        if iv.type == "IntervalsT" and iv.repeat and iv.on_duration and iv.off_duration:
            for rep in range(iv.repeat):
                on_start = cursor_min
                on_end = on_start + iv.on_duration / 60
                result.append(
                    {
                        "start_min": round(on_start, 1),
                        "end_min": round(on_end, 1),
                        "power_percent": round((iv.on_power or 0) * 100),
                        "label": f"{iv.label} {rep + 1}",
                    }
                )
                off_start = on_end
                off_end = off_start + iv.off_duration / 60
                result.append(
                    {
                        "start_min": round(off_start, 1),
                        "end_min": round(off_end, 1),
                        "power_percent": round((iv.off_power or 0) * 100),
                        "label": "Rest",
                    }
                )
                cursor_min = off_end
        else:
            dur_min = iv.duration_seconds / 60
            power_pct = 0
            if iv.power:
                power_pct = round(iv.power * 100)
            elif iv.power_low and iv.power_high:
                power_pct = round((iv.power_low + iv.power_high) / 2 * 100)
            result.append(
                {
                    "start_min": round(cursor_min, 1),
                    "end_min": round(cursor_min + dur_min, 1),
                    "power_percent": power_pct,
                    "label": iv.label,
                }
            )
            cursor_min += dur_min
    return result


def _deploy_zwift(name: str, desc: str, intervals: list, zwo_content: str) -> dict:
    from zwift.deployer import deploy_workout
    from zwift.zwo_generator import generate_filename

    today_str = datetime.now(JST).strftime("%Y%m%d")
    session = intervals[0].type if intervals else "workout"
    zwo_filename = generate_filename(session, today_str, zwo_content)

    try:
        result = deploy_workout(zwo_content, zwo_filename)
        return {
            "platform_status": result.status,
            "platform_message": result.message,
            "filename": zwo_filename,
        }
    except Exception as e:
        return {
            "platform_status": "failed",
            "platform_message": str(e),
            "filename": zwo_filename,
        }


def _deploy_mywhoosh(name: str, desc: str, intervals: list, estimated_tss: float) -> dict:
    from mywhoosh.client import MyWhooshClient
    from mywhoosh.converter import intervals_to_mywhoosh_payload

    payload = intervals_to_mywhoosh_payload(name, desc, intervals, estimated_tss)
    client = MyWhooshClient()

    try:
        result = client.upload_workout(payload)
        return {"platform_status": result.status, "platform_message": result.message}
    except Exception as e:
        return {"platform_status": "failed", "platform_message": str(e)}


def build_and_register_workout(
    session_type: str,
    duration_minutes: int,
    ftp: int,
    target_tss: float | None = None,
    description: str | None = None,
) -> dict:
    try:
        intervals = get_template(session_type, duration_minutes, ftp)
    except ValueError as e:
        return {
            "status": "error",
            "error_message": str(e),
        }

    estimated_tss = estimate_tss(intervals, ftp)
    name = _build_interval_name(session_type, intervals)
    desc = description or f"PerfRide auto-generated {name}"
    formatted = _format_intervals(intervals)

    platform = WORKOUT_PLATFORM.lower()
    if platform == "zwift":
        from zwift.zwo_generator import generate_zwo

        zwo_content = generate_zwo(name, desc, intervals)
        deploy_info = _deploy_zwift(name, desc, intervals, zwo_content)
    else:
        deploy_info = _deploy_mywhoosh(name, desc, intervals, estimated_tss)

    return {
        "status": "success",
        "platform": platform,
        "intervals": formatted,
        "estimated_tss": estimated_tss,
        "summary": name,
        **deploy_info,
    }

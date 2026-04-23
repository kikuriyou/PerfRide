from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo

from recommend_agent.tools._request_context import webhook_trace_id_var
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

_SESSION_TYPE_ALIASES: dict[str, str] = {
    "vo2max": "vo2max",
    "vo2 max": "vo2max",
    "vo2": "vo2max",
    "threshold": "threshold",
    "threshold intervals": "threshold",
    "ftp": "threshold",
    "ftp intervals": "threshold",
    "sweetspot": "sweetspot",
    "sweet spot": "sweetspot",
    "sweet spot intervals": "sweetspot",
    "endurance": "endurance",
    "endurance ride": "endurance",
    "zone 2": "endurance",
    "zone2": "endurance",
    "zone 2 steady state": "endurance",
    "z2": "endurance",
    "recovery": "recovery",
    "recovery ride": "recovery",
    "recovery spin": "recovery",
    "easy spin": "recovery",
    "over under": "over_under",
    "over/under": "over_under",
    "over-under": "over_under",
    "tempo": "tempo",
    "tempo intervals": "tempo",
    "sprint": "sprint",
    "sprints": "sprint",
    "race simulation": "race_simulation",
    "race sim": "race_simulation",
    "race pace": "race_simulation",
}


def _current_jst() -> datetime:
    return datetime.now(JST)


def _normalize_session_type(session_type: str) -> str:
    normalized = " ".join(session_type.replace("_", " ").replace("-", " ").strip().lower().split())
    if normalized in _SESSION_TYPE_ALIASES:
        return _SESSION_TYPE_ALIASES[normalized]
    compact = normalized.replace(" ", "")
    return _SESSION_TYPE_ALIASES.get(compact, compact)


def _log_build(message: str) -> None:
    trace_id = webhook_trace_id_var.get()
    if trace_id:
        print(f"[workout-register trace_id={trace_id}] {message}")
    else:
        print(f"[workout-register] {message}")


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


def _build_workout_name(base_name: str, registered_at: datetime) -> str:
    registered_label = registered_at.strftime("%Y%m%d-%H%M")
    return f"PerfRide {registered_label} {base_name}"


def _build_description(base_name: str, registered_at: datetime) -> str:
    registered_label = registered_at.strftime("%Y-%m-%d %H:%M JST")
    return f"PerfRide auto-generated {base_name} (registered {registered_label})"


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

    today_str = _current_jst().strftime("%Y%m%d")
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
    requested_session_type = session_type
    session_type = _normalize_session_type(session_type)
    _log_build(
        "Requested: "
        f"session_type={requested_session_type} normalized_session_type={session_type} "
        f"duration_minutes={duration_minutes} ftp={ftp} "
        f"target_tss={target_tss} platform={WORKOUT_PLATFORM.lower()}"
    )

    try:
        intervals = get_template(session_type, duration_minutes, ftp)
    except ValueError as e:
        _log_build(f"Template build failed: {e}")
        return {
            "status": "error",
            "error_message": (
                f"{e}. Supported session types: "
                "vo2max, threshold, sweetspot, endurance, recovery, "
                "over_under, tempo, sprint, race_simulation"
            ),
        }

    estimated_tss = estimate_tss(intervals, ftp)
    registered_at = _current_jst()
    base_name = _build_interval_name(session_type, intervals)
    name = _build_workout_name(base_name, registered_at)
    desc = description or _build_description(base_name, registered_at)
    formatted = _format_intervals(intervals)
    _log_build(
        f"Template built: base_summary={base_name} summary={name} "
        f"estimated_tss={round(estimated_tss, 1)} "
        f"intervals={len(formatted)}"
    )

    platform = WORKOUT_PLATFORM.lower()
    if platform == "zwift":
        from zwift.zwo_generator import generate_zwo

        zwo_content = generate_zwo(name, desc, intervals)
        deploy_info = _deploy_zwift(name, desc, intervals, zwo_content)
    else:
        deploy_info = _deploy_mywhoosh(name, desc, intervals, estimated_tss)

    result = {
        "status": "success" if deploy_info.get("platform_status") != "failed" else "error",
        "platform": platform,
        "intervals": formatted,
        "estimated_tss": estimated_tss,
        "summary": name,
        "base_summary": base_name,
        "registered_at": registered_at.isoformat(),
        **deploy_info,
    }
    if deploy_info.get("filename"):
        result["workout_id"] = deploy_info["filename"]
    _log_build(
        "Registration result: "
        f"status={result['status']} platform_status={deploy_info.get('platform_status')} "
        f"workout_id={result.get('workout_id')} message={deploy_info.get('platform_message')}"
    )
    return result

from __future__ import annotations

from datetime import date

from recommend_agent.gcs import now_jst_iso, read_gcs_json, write_gcs_json


def _parse_date(value: object) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _normalize_weekly_plan(value: object) -> dict[str, dict]:
    if isinstance(value, dict):
        return {str(k): v for k, v in value.items() if isinstance(v, dict)}

    if isinstance(value, list):
        normalized: dict[str, dict] = {}
        for idx, week in enumerate(value, start=1):
            if not isinstance(week, dict):
                continue
            week_number = week.get("week_number")
            if not isinstance(week_number, int):
                week_number = idx
            normalized[f"week_{week_number}"] = week
        return normalized

    return {}


def _session_dates(week: dict) -> list[date]:
    sessions = week.get("sessions", [])
    if not isinstance(sessions, list):
        return []
    parsed = [_parse_date(session.get("date")) for session in sessions if isinstance(session, dict)]
    return [d for d in parsed if d is not None]


def _week_sort_key(item: tuple[str, dict]) -> tuple[int, str]:
    key, week = item
    week_number = week.get("week_number")
    if isinstance(week_number, int):
        return (week_number, key)
    return (10**9, key)


def _find_target_week_key(weekly_plan: dict[str, dict], session_date: date) -> str | None:
    for key, week in weekly_plan.items():
        dates = _session_dates(week)
        if dates and min(dates) <= session_date <= max(dates):
            return key
    return None


def _recalculate_week_target_tss(week: dict) -> None:
    sessions = week.get("sessions", [])
    if not isinstance(sessions, list):
        week["sessions"] = []
        week["target_tss"] = 0
        return

    total = 0
    for session in sessions:
        if not isinstance(session, dict):
            continue
        tss = session.get("target_tss")
        if isinstance(tss, (int, float)):
            total += int(tss)
    week["target_tss"] = total


def _next_week_number(weekly_plan: dict[str, dict]) -> int:
    week_numbers = [
        week_number
        for week in weekly_plan.values()
        if isinstance(week, dict)
        for week_number in [week.get("week_number")]
        if isinstance(week_number, int)
    ]
    return max(week_numbers, default=0) + 1


def update_training_plan(
    session_date: str,
    session_type: str,
    duration_minutes: int = 0,
    target_tss: int = 0,
    status: str = "planned",
    workout_id: str | None = None,
    actual_tss: float | None = None,
) -> dict:
    try:
        data = read_gcs_json("training_plan.json")
        if data is None:
            data = {"weekly_plan": {}}

        weekly_plan = _normalize_weekly_plan(data.get("weekly_plan"))
        parsed_session_date = _parse_date(session_date)
        if parsed_session_date is None:
            return {
                "status": "error",
                "error_message": f"Invalid session_date: {session_date}",
            }

        session_entry = {
            "date": session_date,
            "type": session_type,
            "duration_minutes": duration_minutes,
            "target_tss": target_tss,
            "status": status,
            "updated_by": "recommend_agent",
            "updated_at": now_jst_iso(),
        }
        if workout_id is not None:
            session_entry["workout_id"] = workout_id
        if actual_tss is not None:
            session_entry["actual_tss"] = actual_tss

        found = False
        for _week_key, week in sorted(weekly_plan.items(), key=_week_sort_key):
            sessions = week.get("sessions", [])
            if not isinstance(sessions, list):
                continue
            for i, s in enumerate(sessions):
                if isinstance(s, dict) and s.get("date") == session_date:
                    sessions[i] = {**sessions[i], **session_entry}
                    found = True
                    _recalculate_week_target_tss(week)
                    break
            if found:
                break

        if not found:
            target_week_key = _find_target_week_key(weekly_plan, parsed_session_date)
            if target_week_key is None:
                next_week_number = _next_week_number(weekly_plan)
                target_week_key = f"week_{next_week_number}"
                last_week = max(weekly_plan.items(), key=_week_sort_key)[1] if weekly_plan else {}
                target_week = {
                    "week_number": next_week_number,
                    "phase": last_week.get("phase", data.get("current_phase", "custom")),
                    "target_tss": 0,
                    "sessions": [],
                }
                weekly_plan[target_week_key] = target_week
            else:
                target_week = weekly_plan[target_week_key]

            target_week.setdefault("sessions", []).append(session_entry)
            _recalculate_week_target_tss(target_week)

        data["weekly_plan"] = weekly_plan
        data["updated_at"] = now_jst_iso()
        data["updated_by"] = "recommend_agent"
        write_gcs_json("training_plan.json", data)

        return {
            "status": "success",
            "updated_session": session_entry,
        }

    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to update training plan: {e}",
        }

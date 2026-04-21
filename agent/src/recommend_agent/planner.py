"""Training plan generator with classic periodization."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")

SESSION_DEFAULTS: dict[str, tuple[int, int]] = {
    "rest": (0, 0),
    "recovery": (45, 25),
    "endurance": (90, 55),
    "sweetspot": (90, 75),
    "tempo": (90, 70),
    "threshold": (90, 80),
    "vo2max": (75, 85),
    "race_simulation": (150, 110),
    "sprint": (60, 65),
}

PHASE_TEMPLATES: dict[str, list[str]] = {
    "base": ["rest", "endurance", "recovery", "endurance", "rest", "endurance", "recovery"],
    "build1": ["rest", "sweetspot", "recovery", "tempo", "rest", "tempo", "endurance"],
    "build2": ["rest", "vo2max", "recovery", "threshold", "rest", "race_simulation", "recovery"],
    "peak": ["rest", "threshold", "rest", "vo2max", "rest", "race_simulation", "recovery"],
    "taper": ["rest", "tempo", "rest", "recovery", "rest", "race_simulation", "recovery"],
}

DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


@dataclass
class TrainingSession:
    date: str
    type: str
    duration_minutes: int = 0
    target_tss: int = 0
    status: str = "planned"


@dataclass
class WeekPlan:
    week_number: int
    phase: str
    target_tss: int
    sessions: list[TrainingSession] = field(default_factory=list)


def _compute_phases(total_weeks: int) -> list[tuple[str, int]]:
    if total_weeks >= 12:
        base = math.floor(total_weeks * 0.35)
        build1 = math.floor(total_weeks * 0.25)
        build2 = math.floor(total_weeks * 0.20)
        peak = math.floor(total_weeks * 0.10)
        taper = max(1, total_weeks - base - build1 - build2 - peak)
        return [
            ("base", base),
            ("build1", build1),
            ("build2", build2),
            ("peak", peak),
            ("taper", taper),
        ]
    if total_weeks >= 6:
        base = math.floor(total_weeks * 0.3)
        build1 = math.floor(total_weeks * 0.4)
        peak = math.floor(total_weeks * 0.15)
        taper = max(1, total_weeks - base - build1 - peak)
        return [("base", base), ("build1", build1), ("peak", peak), ("taper", taper)]
    maintain = max(1, total_weeks - 1)
    return [("build1", maintain), ("taper", 1)]


def _make_session(
    session_date: date,
    session_type: str,
    max_minutes: int | None = None,
) -> TrainingSession:
    duration, tss = SESSION_DEFAULTS[session_type]
    if max_minutes is not None and duration > max_minutes:
        ratio = max_minutes / duration if duration > 0 else 0
        duration = max_minutes
        tss = round(tss * ratio)
    return TrainingSession(
        date=session_date.isoformat(),
        type=session_type,
        duration_minutes=duration,
        target_tss=tss,
    )


def _build_week(
    week_number: int,
    phase_name: str,
    week_start: date,
    available_days: dict[str, dict] | None,
) -> WeekPlan:
    template = PHASE_TEMPLATES[phase_name]
    sessions: list[TrainingSession] = []

    if available_days:
        active_types = [t for t in template if t != "rest"]
        active_idx = 0
        for i, day_name in enumerate(DAY_NAMES):
            session_date = week_start + timedelta(days=i)
            day_info = available_days.get(day_name, {})
            if day_info.get("available", False) and active_idx < len(active_types):
                max_min = day_info.get("max_minutes")
                sessions.append(_make_session(session_date, active_types[active_idx], max_min))
                active_idx += 1
            else:
                sessions.append(_make_session(session_date, "rest"))
    else:
        for i, session_type in enumerate(template):
            session_date = week_start + timedelta(days=i)
            sessions.append(_make_session(session_date, session_type))

    target_tss = sum(s.target_tss for s in sessions)
    return WeekPlan(
        week_number=week_number,
        phase=phase_name,
        target_tss=target_tss,
        sessions=sessions,
    )


def _current_phase(phases_with_dates: list[dict], today: date) -> str:
    today_str = today.isoformat()
    for p in phases_with_dates:
        if p["start"] <= today_str <= p["end"]:
            return p["name"]
    return phases_with_dates[0]["name"] if phases_with_dates else "base"


def generate_training_plan(
    user_id: str,
    goal_event: str,
    goal_date: str,
    available_days: dict[str, dict] | None = None,
) -> dict:
    today = date.today()
    target = date.fromisoformat(goal_date)
    total_weeks = max(1, (target - today).days // 7)

    phase_defs = _compute_phases(total_weeks)

    phases_with_dates: list[dict] = []
    weekly_plan: dict[str, dict] = {}
    week_cursor = today
    week_number = 1

    for phase_name, week_count in phase_defs:
        phase_start = week_cursor
        for _ in range(week_count):
            wp = _build_week(week_number, phase_name, week_cursor, available_days)
            weekly_plan[f"week_{week_number}"] = {
                "week_number": wp.week_number,
                "phase": wp.phase,
                "target_tss": wp.target_tss,
                "sessions": [
                    {
                        "date": s.date,
                        "type": s.type,
                        "duration_minutes": s.duration_minutes,
                        "target_tss": s.target_tss,
                        "status": s.status,
                    }
                    for s in wp.sessions
                ],
            }
            week_cursor += timedelta(weeks=1)
            week_number += 1
        phase_end = week_cursor - timedelta(days=1)
        phases_with_dates.append(
            {
                "name": phase_name,
                "start": phase_start.isoformat(),
                "end": phase_end.isoformat(),
            }
        )

    now_iso = datetime.now(JST).isoformat()
    return {
        "user_id": user_id,
        "plan_id": f"plan_{today.isoformat()}",
        "goal_event": goal_event,
        "current_phase": _current_phase(phases_with_dates, today),
        "phases": phases_with_dates,
        "weekly_plan": weekly_plan,
        "updated_at": now_iso,
        "updated_by": "planner",
    }


def save_training_plan(plan: dict) -> None:
    from recommend_agent.gcs import write_gcs_json

    write_gcs_json("training_plan.json", plan)

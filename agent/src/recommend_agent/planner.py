"""Training plan generator with classic periodization."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

SessionOrigin = Literal["baseline", "appended"]

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
    "maintenance": ["rest", "endurance", "recovery", "tempo", "rest", "endurance", "recovery"],
    "base": ["rest", "endurance", "recovery", "endurance", "rest", "endurance", "recovery"],
    "build1": ["rest", "sweetspot", "recovery", "tempo", "rest", "tempo", "endurance"],
    "build2": ["rest", "vo2max", "recovery", "threshold", "rest", "race_simulation", "recovery"],
    "peak": ["rest", "threshold", "rest", "vo2max", "rest", "race_simulation", "recovery"],
    "taper": ["rest", "tempo", "rest", "recovery", "rest", "race_simulation", "recovery"],
}

DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
HIGH_INTENSITY_TYPES = {"threshold", "vo2max", "race_simulation", "sprint"}


@dataclass
class TrainingSession:
    date: str
    type: str
    duration_minutes: int = 0
    target_tss: int = 0
    planned_tss: int = 0
    status: str = "planned"
    origin: SessionOrigin = "baseline"


@dataclass
class WeekPlan:
    week_number: int
    week_start: str
    phase: str
    target_tss: int
    plan_revision: int
    status: str
    sessions: list[TrainingSession] = field(default_factory=list)


def _week_start(reference_date: date) -> date:
    return reference_date - timedelta(days=reference_date.weekday())


def _parse_goal_date(goal_date: str | None) -> date | None:
    if not goal_date:
        return None
    try:
        return date.fromisoformat(goal_date)
    except ValueError:
        return None


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
    if total_weeks >= 2:
        return [("build1", max(1, total_weeks - 1)), ("taper", 1)]
    return [("maintenance", 1)]


def _make_session(
    session_date: date,
    session_type: str,
    max_minutes: int | None = None,
) -> TrainingSession:
    duration, tss = SESSION_DEFAULTS[session_type]
    if max_minutes is not None and max_minutes >= 0 and duration > max_minutes:
        ratio = max_minutes / duration if duration > 0 else 0
        duration = max_minutes
        tss = round(tss * ratio)
    return TrainingSession(
        date=session_date.isoformat(),
        type=session_type,
        duration_minutes=duration,
        target_tss=tss,
        planned_tss=tss,
        origin="baseline",
    )


def _day_available(day_info: object) -> tuple[bool, int | None]:
    if not isinstance(day_info, dict):
        return True, None
    available = day_info.get("available")
    max_minutes = day_info.get("max_minutes")
    return (
        bool(available) if isinstance(available, bool) else True,
        int(max_minutes) if isinstance(max_minutes, (int, float)) else None,
    )


def _should_downgrade(prev_type: str, current_type: str) -> bool:
    return prev_type in HIGH_INTENSITY_TYPES and current_type in HIGH_INTENSITY_TYPES


def _downgraded_type(session_type: str) -> str:
    if session_type in {"vo2max", "threshold", "race_simulation"}:
        return "tempo"
    if session_type == "sprint":
        return "recovery"
    return session_type


def _build_week(
    week_start: date,
    phase_name: str,
    available_days: dict[str, dict[str, object]] | None,
) -> WeekPlan:
    template = PHASE_TEMPLATES[phase_name]
    sessions: list[TrainingSession] = []
    previous_type = "rest"

    for offset, default_type in enumerate(template):
        session_date = week_start + timedelta(days=offset)
        day_name = DAY_NAMES[offset]
        available, max_minutes = _day_available(available_days.get(day_name) if available_days else None)
        session_type = default_type
        if not available:
            session_type = "rest"
        elif _should_downgrade(previous_type, session_type):
            session_type = _downgraded_type(session_type)
        if session_type == "rest":
            max_minutes = 0
        session = _make_session(session_date, session_type, max_minutes)
        sessions.append(session)
        previous_type = session.type

    target_tss = sum(session.target_tss for session in sessions)
    return WeekPlan(
        week_number=week_start.isocalendar().week,
        week_start=week_start.isoformat(),
        phase=phase_name,
        target_tss=target_tss,
        plan_revision=1,
        status="draft",
        sessions=sessions,
    )


def _build_phase_schedule(reference_date: date, goal_date: date | None) -> list[tuple[str, int]]:
    if goal_date is None or goal_date <= reference_date:
        return [("maintenance", 1)]
    total_weeks = max(1, ((goal_date - reference_date).days // 7) + 1)
    return _compute_phases(total_weeks)


def generate_training_plan(
    user_id: str,
    goal_event: str,
    goal_date: str | None,
    available_days: dict[str, dict[str, object]] | None = None,
    reference_date: date | None = None,
) -> dict:
    reference = _week_start(reference_date or date.today())
    target = _parse_goal_date(goal_date)
    phase_defs = _build_phase_schedule(reference, target)

    phases_with_dates: list[dict[str, str]] = []
    weekly_plan: dict[str, dict[str, object]] = {}
    week_cursor = reference

    for phase_name, week_count in phase_defs:
        phase_start = week_cursor
        for _ in range(week_count):
            week = _build_week(week_cursor, phase_name, available_days)
            weekly_plan[f"week_{week.week_number}"] = {
                "week_start": week.week_start,
                "week_number": week.week_number,
                "phase": week.phase,
                "target_tss": week.target_tss,
                "plan_revision": week.plan_revision,
                "status": week.status,
                "sessions": [
                    {
                        "date": session.date,
                        "type": session.type,
                        "duration_minutes": session.duration_minutes,
                        "target_tss": session.target_tss,
                        "planned_tss": session.planned_tss,
                        "status": session.status,
                        "origin": session.origin,
                        "updated_by": "planner",
                        "updated_at": datetime.now(JST).isoformat(),
                    }
                    for session in week.sessions
                ],
                "updated_at": datetime.now(JST).isoformat(),
                "updated_by": "planner",
            }
            week_cursor += timedelta(weeks=1)
        phase_end = week_cursor - timedelta(days=1)
        phases_with_dates.append(
            {
                "name": phase_name,
                "start": phase_start.isoformat(),
                "end": phase_end.isoformat(),
            }
        )

    now_iso = datetime.now(JST).isoformat()
    current_phase = phase_defs[0][0] if phase_defs else "maintenance"
    return {
        "user_id": user_id,
        "plan_id": f"plan_{reference.isoformat()}",
        "goal_event": goal_event,
        "current_phase": current_phase,
        "phases": phases_with_dates,
        "weekly_plan": weekly_plan,
        "updated_at": now_iso,
        "updated_by": "planner",
    }


def save_training_plan(plan: dict) -> None:
    from recommend_agent.gcs import write_gcs_json

    write_gcs_json("training_plan.json", plan)

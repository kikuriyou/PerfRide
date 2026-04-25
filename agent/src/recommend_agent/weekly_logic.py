from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

from recommend_agent.plan_store import (
    WeekPayload,
    WeeklyPlanReviewPayload,
    get_current_week,
    get_review,
    load_training_plan,
    monday_of_week,
    normalize_week_payload,
    review_id_for_week_start,
)
from recommend_agent.planner import generate_training_plan

DAY_OFFSETS = list(range(7))


def build_plan_context_key(
    coach_autonomy: str,
    week_start: str,
    plan_revision: int,
    plan_status: str,
) -> str:
    return f"{coach_autonomy}:{week_start}:{plan_revision}:{plan_status}"


def _goal_event(profile: dict[str, object]) -> str:
    goal = profile.get("goal")
    if not isinstance(goal, dict):
        return "fitness_maintenance"
    goal_type = goal.get("type")
    goal_name = goal.get("name")
    if isinstance(goal_name, str) and goal_name.strip():
        return goal_name.strip()
    return goal_type if isinstance(goal_type, str) else "fitness_maintenance"


def _goal_date(profile: dict[str, object]) -> str | None:
    goal = profile.get("goal")
    if not isinstance(goal, dict):
        return None
    goal_date = goal.get("date")
    return goal_date if isinstance(goal_date, str) and goal_date else None


def _weekly_schedule(profile: dict[str, object]) -> dict[str, dict[str, object]] | None:
    training_preference = profile.get("training_preference")
    if not isinstance(training_preference, dict):
        return None
    weekly_schedule = training_preference.get("weekly_schedule")
    if not isinstance(weekly_schedule, dict):
        return None
    return {
        str(day_name): dict(day_info)
        for day_name, day_info in weekly_schedule.items()
        if isinstance(day_info, dict)
    }


def _fallback_summary(week: WeekPayload) -> str:
    sessions = week.get("sessions", [])
    non_rest = [session.get("type") for session in sessions if session.get("type") != "rest"]
    if not non_rest:
        return f"{week['phase']} week / rest focus"
    return f"{week['phase']} week / {', '.join(str(value) for value in non_rest[:3])}"


def _pick_generated_week(generated_plan: dict, week_start: str) -> dict[str, Any] | None:
    weekly_plan = generated_plan.get("weekly_plan")
    if not isinstance(weekly_plan, dict):
        return None
    for week in weekly_plan.values():
        if isinstance(week, dict) and week.get("week_start") == week_start:
            return week
    return next((week for week in weekly_plan.values() if isinstance(week, dict)), None)


def build_baseline_week(
    profile: dict[str, object],
    week_start_date: date,
    *,
    plan_revision: int,
    updated_by: str = "weekly_planner",
) -> WeekPayload:
    generated = generate_training_plan(
        user_id=str(profile.get("user_id", "default")),
        goal_event=_goal_event(profile),
        goal_date=_goal_date(profile),
        available_days=_weekly_schedule(profile),
        reference_date=week_start_date,
    )
    selected_week = _pick_generated_week(generated, week_start_date.isoformat()) or {}
    baseline = normalize_week_payload(
        selected_week,
        status="pending",
        plan_revision=plan_revision,
        updated_by=updated_by,
    )
    if "summary" not in baseline:
        baseline["summary"] = _fallback_summary(baseline)
    return baseline


def _parse_agent_json(raw_response: str) -> dict[str, Any] | None:
    text = raw_response.strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif text.startswith("```") and "```" in text[3:]:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _has_valid_sequence(week: WeekPayload, week_start_date: date) -> bool:
    """Validate that sessions cover all 7 days of the week.

    Same-date duplicates are allowed (an "appended" session may sit alongside
    the baseline). Sessions outside the 7-day window are rejected.
    """
    sessions = week.get("sessions", [])
    expected_dates = {
        (week_start_date + timedelta(days=offset)).isoformat() for offset in DAY_OFFSETS
    }
    actual_dates = {
        session.get("date") for session in sessions if isinstance(session.get("date"), str)
    }
    return actual_dates == expected_dates


def coerce_weekly_draft(
    raw_response: str | None,
    *,
    baseline_week: WeekPayload,
    week_start_date: date,
    plan_revision: int,
    status: str = "pending",
    updated_by: str = "weekly_plan_agent",
) -> WeekPayload:
    parsed = _parse_agent_json(raw_response) if raw_response else None
    candidate_source = {
        "week_start": week_start_date.isoformat(),
        "week_number": baseline_week["week_number"],
        "phase": parsed.get("phase") if isinstance(parsed, dict) else baseline_week["phase"],
        "summary": parsed.get("summary")
        if isinstance(parsed, dict)
        else baseline_week.get("summary"),
        "target_tss": parsed.get("target_tss")
        if isinstance(parsed, dict)
        else baseline_week["target_tss"],
        "sessions": parsed.get("sessions")
        if isinstance(parsed, dict)
        else baseline_week["sessions"],
    }
    candidate = normalize_week_payload(
        candidate_source,
        status=status,
        plan_revision=plan_revision,
        updated_by=updated_by,
    )
    if not _has_valid_sequence(candidate, week_start_date):
        fallback = normalize_week_payload(
            baseline_week,
            status=status,
            plan_revision=plan_revision,
            updated_by=updated_by,
        )
        if "summary" not in fallback:
            fallback["summary"] = _fallback_summary(fallback)
        return fallback
    if "summary" not in candidate:
        candidate["summary"] = _fallback_summary(candidate)
    return candidate


def current_plan_context(reference_date: date) -> dict[str, object] | None:
    training_plan = load_training_plan()
    weekly_plan = training_plan.get("weekly_plan")
    if isinstance(weekly_plan, dict):
        approved_week = get_current_week(weekly_plan, reference_date)
        if approved_week is not None:
            return {
                "source": "approved",
                "week": approved_week,
            }

    review = get_review(review_id_for_week_start(monday_of_week(reference_date).isoformat()))
    if review and review.get("status") in {"pending", "modified"}:
        draft = review.get("draft")
        if isinstance(draft, dict):
            return {
                "source": "pending",
                "week": draft,
                "review": review,
            }
    return None


def current_session_context(reference_date: date) -> dict[str, object] | None:
    """Return the week + all sessions scheduled for ``reference_date``.

    The ``sessions`` list contains every session whose ``date`` matches the
    reference date — possibly empty (rest day) or multiple entries (one
    baseline plus one or more appended sessions).
    """
    context = current_plan_context(reference_date)
    if context is None:
        return None
    week = context.get("week")
    if not isinstance(week, dict):
        return None
    target = reference_date.isoformat()
    sessions = [
        session
        for session in week.get("sessions", [])
        if isinstance(session, dict) and session.get("date") == target
    ]
    return {
        "source": context["source"],
        "week": week,
        "sessions": sessions,
        "review": context.get("review"),
    }


def review_for_week_start(week_start_date: date) -> WeeklyPlanReviewPayload | None:
    return get_review(review_id_for_week_start(week_start_date.isoformat()))

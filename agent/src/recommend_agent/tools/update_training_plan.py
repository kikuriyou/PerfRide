from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal

from recommend_agent.gcs import now_jst_iso
from recommend_agent.plan_store import (
    PLAN_FILE,
    SessionOrigin,
    normalize_weekly_plan,
    parse_iso_date,
    recalculate_week_target_tss,
    transactional_update,
)

UpdateMode = Literal["replace", "append"]


class _UpdateAbortedError(Exception):
    """Raised inside the mutator to short-circuit the GCS write with a result."""

    def __init__(self, result: dict[str, Any]) -> None:
        super().__init__(result.get("error_message") or result.get("status", "aborted"))
        self.result = result


def _session_dates(week: dict) -> list[date]:
    sessions = week.get("sessions", [])
    if not isinstance(sessions, list):
        return []
    parsed = [
        parse_iso_date(session.get("date")) for session in sessions if isinstance(session, dict)
    ]
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


def _next_week_number(weekly_plan: dict[str, dict]) -> int:
    week_numbers = [
        week_number
        for week in weekly_plan.values()
        if isinstance(week, dict)
        for week_number in [week.get("week_number")]
        if isinstance(week_number, int)
    ]
    return max(week_numbers, default=0) + 1


def _bump_plan_revision(week: dict) -> int:
    plan_revision = week.get("plan_revision")
    new_revision = (plan_revision + 1) if isinstance(plan_revision, int) else 2
    week["plan_revision"] = new_revision
    return new_revision


def update_training_plan(
    session_date: str,
    session_type: str,
    duration_minutes: int = 0,
    target_tss: int = 0,
    status: str = "planned",
    workout_id: str | None = None,
    actual_tss: float | None = None,
    notes: str | None = None,
    preserve_plan_revision: bool = False,
    mode: UpdateMode = "replace",
    expected_plan_revision: int | None = None,
) -> dict:
    """Update or append a training session in the GCS-backed weekly plan.

    Modes:
    - ``replace`` (default): match by ``session_date``; update an existing
      session in place, or create one if none exists. Existing webhook flows
      use this.
    - ``append``: always add a new session at ``session_date``. The target
      week must already contain ``session_date`` (no new weeks are created).

    Optimistic locking: when ``expected_plan_revision`` is provided, the
    write proceeds only if the target week's current ``plan_revision``
    matches. On mismatch, the response status is ``"conflict"`` with the
    current revision and sessions returned for the caller to reconcile.
    """
    parsed_session_date = parse_iso_date(session_date)
    if parsed_session_date is None:
        return {
            "status": "error",
            "error_message": f"Invalid session_date: {session_date}",
        }

    captured: dict[str, Any] = {}

    def _mutator(current: dict | None) -> dict:
        data = current if isinstance(current, dict) else {"weekly_plan": {}}
        weekly_plan = normalize_weekly_plan(data.get("weekly_plan"))

        new_session_origin: SessionOrigin = "appended" if mode == "append" else "baseline"
        session_entry: dict[str, Any] = {
            "date": session_date,
            "type": session_type,
            "duration_minutes": duration_minutes,
            "target_tss": target_tss,
            "planned_tss": target_tss,
            "status": status,
            "origin": new_session_origin,
            "updated_by": "recommend_agent",
            "updated_at": now_jst_iso(),
        }
        if workout_id is not None:
            session_entry["workout_id"] = workout_id
        if actual_tss is not None:
            session_entry["actual_tss"] = actual_tss
        if notes is not None and notes.strip():
            session_entry["notes"] = notes.strip()

        target_week_key = _find_target_week_key(weekly_plan, parsed_session_date)

        if mode == "append":
            if target_week_key is None:
                raise _UpdateAbortedError(
                    {
                        "status": "error",
                        "error_message": (
                            f"session_date {session_date} is outside the current weekly plan window"
                        ),
                    }
                )
            target_week = weekly_plan[target_week_key]
            if (
                expected_plan_revision is not None
                and target_week.get("plan_revision") != expected_plan_revision
            ):
                raise _UpdateAbortedError(
                    {
                        "status": "conflict",
                        "current_plan_revision": target_week.get("plan_revision"),
                        "current_sessions": list(target_week.get("sessions", [])),
                        "week_start": target_week.get("week_start"),
                        "error_message": "stale plan revision",
                    }
                )
            target_week.setdefault("sessions", []).append(session_entry)
            recalculate_week_target_tss(target_week)
            if not preserve_plan_revision:
                _bump_plan_revision(target_week)
            target_week["updated_by"] = "recommend_agent"
            target_week["updated_at"] = session_entry["updated_at"]
            data["weekly_plan"] = weekly_plan
            data["updated_at"] = session_entry["updated_at"]
            data["updated_by"] = "recommend_agent"
            captured["result"] = {
                "status": "success",
                "updated_session": session_entry,
                "plan_revision": target_week.get("plan_revision"),
                "week_start": target_week.get("week_start"),
            }
            return data

        # mode == "replace": match-and-update; create a new week only if needed.
        for _key, week in sorted(weekly_plan.items(), key=_week_sort_key):
            sessions = week.get("sessions", [])
            if not isinstance(sessions, list):
                continue
            for index, existing in enumerate(sessions):
                if not (isinstance(existing, dict) and existing.get("date") == session_date):
                    continue
                if (
                    expected_plan_revision is not None
                    and week.get("plan_revision") != expected_plan_revision
                ):
                    raise _UpdateAbortedError(
                        {
                            "status": "conflict",
                            "current_plan_revision": week.get("plan_revision"),
                            "current_sessions": list(sessions),
                            "week_start": week.get("week_start"),
                            "error_message": "stale plan revision",
                        }
                    )
                # Preserve the existing session's origin on replace.
                preserved_origin = existing.get("origin", "baseline")
                merged = {**existing, **session_entry, "origin": preserved_origin}
                before = dict(existing)
                sessions[index] = merged
                recalculate_week_target_tss(week)
                if (
                    not preserve_plan_revision
                    and week.get("status") == "approved"
                    and before != merged
                ):
                    _bump_plan_revision(week)
                    week["updated_by"] = "recommend_agent"
                    week["updated_at"] = session_entry["updated_at"]
                data["weekly_plan"] = weekly_plan
                data["updated_at"] = now_jst_iso()
                data["updated_by"] = "recommend_agent"
                captured["result"] = {
                    "status": "success",
                    "updated_session": merged,
                    "plan_revision": week.get("plan_revision"),
                    "week_start": week.get("week_start"),
                }
                return data

        # No matching session found in any week. Create or attach to a target week.
        created_new_week = False
        if target_week_key is None:
            next_week_number = _next_week_number(weekly_plan)
            target_week_key = f"week_{next_week_number}"
            last_week = max(weekly_plan.items(), key=_week_sort_key)[1] if weekly_plan else {}
            week_start = parsed_session_date - timedelta(days=parsed_session_date.weekday())
            target_week = {
                "week_start": week_start.isoformat(),
                "week_number": next_week_number,
                "phase": last_week.get("phase", data.get("current_phase", "custom")),
                "target_tss": 0,
                "plan_revision": 1,
                "status": last_week.get("status", "approved"),
                "sessions": [],
                "updated_by": "recommend_agent",
                "updated_at": session_entry["updated_at"],
            }
            weekly_plan[target_week_key] = target_week
            created_new_week = True
        else:
            target_week = weekly_plan[target_week_key]
            if (
                expected_plan_revision is not None
                and target_week.get("plan_revision") != expected_plan_revision
            ):
                raise _UpdateAbortedError(
                    {
                        "status": "conflict",
                        "current_plan_revision": target_week.get("plan_revision"),
                        "current_sessions": list(target_week.get("sessions", [])),
                        "week_start": target_week.get("week_start"),
                        "error_message": "stale plan revision",
                    }
                )

        target_week.setdefault("sessions", []).append(session_entry)
        recalculate_week_target_tss(target_week)
        if (
            not preserve_plan_revision
            and not created_new_week
            and target_week.get("status") == "approved"
        ):
            _bump_plan_revision(target_week)
        target_week["updated_by"] = "recommend_agent"
        target_week["updated_at"] = session_entry["updated_at"]

        data["weekly_plan"] = weekly_plan
        data["updated_at"] = now_jst_iso()
        data["updated_by"] = "recommend_agent"
        captured["result"] = {
            "status": "success",
            "updated_session": session_entry,
            "plan_revision": target_week.get("plan_revision"),
            "week_start": target_week.get("week_start"),
        }
        return data

    try:
        transactional_update(PLAN_FILE, _mutator)
    except _UpdateAbortedError as aborted:
        return aborted.result
    except Exception as exc:
        return {
            "status": "error",
            "error_message": f"Failed to update training plan: {exc}",
        }

    result = captured.get("result")
    if result is None:
        return {
            "status": "error",
            "error_message": "Failed to update training plan: mutator did not record a result",
        }
    return result

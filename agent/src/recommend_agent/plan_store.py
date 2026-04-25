from __future__ import annotations

import random
import time
from collections.abc import Callable
from copy import deepcopy
from datetime import date, timedelta
from typing import Literal, TypedDict

from recommend_agent.gcs import (
    OptimisticLockError,
    now_jst_iso,
    read_gcs_json,
    read_gcs_json_with_generation,
    write_gcs_json,
)

PLAN_FILE = "training_plan.json"
REVIEW_FILE = "weekly_plan_review.json"
DEFAULT_MAX_RETRIES = 3
# Exponential backoff with jitter — keeps two near-simultaneous append calls
# from re-colliding on the same retry slot.
RETRY_BASE_DELAY_SEC = 0.05
RETRY_MAX_DELAY_SEC = 0.5

SessionStatus = Literal[
    "planned",
    "registered",
    "confirmed",
    "completed",
    "skipped",
    "modified",
]
SessionOrigin = Literal["baseline", "appended"]
WeekStatus = Literal["draft", "pending", "modified", "approved", "applied"]
ReviewStatus = Literal["pending", "modified", "approved", "applied", "dismissed", "error"]


class TrainingSessionPayload(TypedDict, total=False):
    date: str
    type: str
    duration_minutes: int
    target_tss: int
    planned_tss: int
    status: SessionStatus
    origin: SessionOrigin
    workout_id: str
    actual_tss: float
    updated_by: str
    updated_at: str
    notes: str


class WeekPayload(TypedDict, total=False):
    week_start: str
    week_number: int
    phase: str
    target_tss: int
    plan_revision: int
    status: WeekStatus
    sessions: list[TrainingSessionPayload]
    summary: str
    updated_at: str
    updated_by: str


class NotificationMetadata(TypedDict, total=False):
    kind: str
    review_id: str
    week_start: str
    plan_revision: int
    respond_path: str


class WeeklyPlanReviewPayload(TypedDict, total=False):
    review_id: str
    week_start: str
    plan_revision: int
    status: ReviewStatus
    draft: WeekPayload
    session_id: str | None
    user_message: str | None
    created_at: str
    notified_at: str | None
    approved_at: str | None
    applied_at: str | None
    dismissed_at: str | None
    error_message: str | None
    notification_metadata: NotificationMetadata


class WeeklyPlanReviewStore(TypedDict):
    reviews: dict[str, WeeklyPlanReviewPayload]
    updated_at: str


def parse_iso_date(value: object) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def monday_of_week(target_date: date) -> date:
    return target_date - timedelta(days=target_date.weekday())


def week_start_from_sessions(sessions: list[TrainingSessionPayload]) -> str | None:
    dates = [parse_iso_date(session.get("date")) for session in sessions]
    valid_dates = [parsed for parsed in dates if parsed is not None]
    if not valid_dates:
        return None
    return monday_of_week(min(valid_dates)).isoformat()


def _week_sort_key(item: tuple[str, WeekPayload]) -> tuple[int, str]:
    key, week = item
    week_number = week.get("week_number")
    if isinstance(week_number, int):
        return (week_number, key)
    if key.startswith("week_"):
        suffix = key.replace("week_", "", 1)
        if suffix.isdigit():
            return (int(suffix), key)
    return (10**9, key)


def normalize_session_payload(
    session: object,
    *,
    default_status: SessionStatus = "planned",
    updated_by: str = "planner",
    updated_at: str | None = None,
) -> TrainingSessionPayload | None:
    if not isinstance(session, dict):
        return None
    session_date = session.get("date")
    session_type = session.get("type")
    if not isinstance(session_date, str) or not isinstance(session_type, str):
        return None
    target_tss = session.get("target_tss")
    if not isinstance(target_tss, int):
        numeric_tss = session.get("planned_tss")
        target_tss = int(numeric_tss) if isinstance(numeric_tss, (int, float)) else 0
    planned_tss = session.get("planned_tss")
    raw_origin = session.get("origin")
    origin: SessionOrigin = raw_origin if raw_origin in ("baseline", "appended") else "baseline"
    payload: TrainingSessionPayload = {
        "date": session_date,
        "type": session_type,
        "duration_minutes": (
            int(session["duration_minutes"])
            if isinstance(session.get("duration_minutes"), (int, float))
            else 0
        ),
        "target_tss": target_tss,
        "planned_tss": int(planned_tss) if isinstance(planned_tss, (int, float)) else target_tss,
        "status": (session["status"] if isinstance(session.get("status"), str) else default_status),
        "origin": origin,
        "updated_by": (
            session["updated_by"] if isinstance(session.get("updated_by"), str) else updated_by
        ),
        "updated_at": (
            session["updated_at"]
            if isinstance(session.get("updated_at"), str)
            else updated_at or now_jst_iso()
        ),
    }
    if isinstance(session.get("workout_id"), str):
        payload["workout_id"] = session["workout_id"]
    if isinstance(session.get("actual_tss"), (int, float)):
        payload["actual_tss"] = float(session["actual_tss"])
    if isinstance(session.get("notes"), str) and session["notes"].strip():
        payload["notes"] = session["notes"].strip()
    return payload


def recalculate_week_target_tss(week: WeekPayload) -> None:
    sessions = week.get("sessions", [])
    total = 0
    normalized_sessions: list[TrainingSessionPayload] = []
    for session in sessions:
        normalized = normalize_session_payload(session)
        if normalized is None:
            continue
        normalized_sessions.append(normalized)
        total += int(normalized.get("target_tss", 0))
    week["sessions"] = normalized_sessions
    week["target_tss"] = total


def normalize_week_payload(
    week: object,
    *,
    status: WeekStatus,
    plan_revision: int,
    updated_by: str,
    updated_at: str | None = None,
) -> WeekPayload:
    now_iso = updated_at or now_jst_iso()
    source = week if isinstance(week, dict) else {}
    raw_sessions = source.get("sessions") if isinstance(source.get("sessions"), list) else []
    sessions = [
        normalized
        for session in raw_sessions
        if (
            normalized := normalize_session_payload(
                session, updated_by=updated_by, updated_at=now_iso
            )
        )
        is not None
    ]

    week_start = source.get("week_start")
    if not isinstance(week_start, str):
        week_start = week_start_from_sessions(sessions) or now_iso[:10]

    week_start_date = parse_iso_date(week_start) or date.fromisoformat(now_iso[:10])
    week_number = source.get("week_number")
    if not isinstance(week_number, int):
        week_number = week_start_date.isocalendar().week

    normalized_week: WeekPayload = {
        "week_start": week_start_date.isoformat(),
        "week_number": week_number,
        "phase": source["phase"] if isinstance(source.get("phase"), str) else "maintenance",
        "target_tss": 0,
        "plan_revision": plan_revision,
        "status": status,
        "sessions": sessions,
        "updated_at": now_iso,
        "updated_by": updated_by,
    }
    if isinstance(source.get("summary"), str) and source["summary"].strip():
        normalized_week["summary"] = source["summary"].strip()
    recalculate_week_target_tss(normalized_week)
    return normalized_week


def normalize_weekly_plan(value: object) -> dict[str, WeekPayload]:
    if isinstance(value, list):
        items = [
            (
                f"week_{entry.get('week_number', index)}",
                entry,
            )
            for index, entry in enumerate(value, start=1)
            if isinstance(entry, dict)
        ]
    elif isinstance(value, dict):
        items = [(str(key), entry) for key, entry in value.items() if isinstance(entry, dict)]
    else:
        items = []

    normalized: dict[str, WeekPayload] = {}
    for key, entry in items:
        plan_revision = entry.get("plan_revision")
        normalized[key] = normalize_week_payload(
            entry,
            status=entry["status"] if isinstance(entry.get("status"), str) else "approved",
            plan_revision=int(plan_revision) if isinstance(plan_revision, int) else 1,
            updated_by=entry["updated_by"]
            if isinstance(entry.get("updated_by"), str)
            else "planner",
            updated_at=entry["updated_at"] if isinstance(entry.get("updated_at"), str) else None,
        )
    return normalized


def review_id_for_week_start(week_start: str) -> str:
    return f"weekly_{week_start}"


def default_review_store() -> WeeklyPlanReviewStore:
    return {
        "reviews": {},
        "updated_at": now_jst_iso(),
    }


def transactional_update(
    filename: str,
    mutator: Callable[[dict | None], dict],
    *,
    max_retries: int = DEFAULT_MAX_RETRIES,
) -> dict:
    """Read-modify-write a GCS JSON object with generation precondition.

    Retries on optimistic-lock conflicts up to `max_retries` times before re-raising.
    Pass `mutator` a function that accepts the current value (or None when missing)
    and returns the new value. The mutator may receive a deep-copied dict so it can
    mutate freely.
    """
    last_error: OptimisticLockError | None = None
    for attempt in range(max_retries):
        current, generation = read_gcs_json_with_generation(filename)
        snapshot = deepcopy(current) if isinstance(current, dict) else None
        new_data = mutator(snapshot)
        try:
            write_gcs_json(filename, new_data, if_generation_match=generation)
            return new_data
        except OptimisticLockError as exc:
            last_error = exc
            if attempt < max_retries - 1:
                _sleep_with_jitter(attempt)
            continue
    assert last_error is not None
    raise last_error


def _sleep_with_jitter(attempt: int) -> None:
    """Exponential backoff with full jitter, capped to keep retries snappy."""
    cap = min(RETRY_MAX_DELAY_SEC, RETRY_BASE_DELAY_SEC * (2**attempt))
    time.sleep(random.uniform(0, cap))


def _normalize_review_store(data: dict | None) -> WeeklyPlanReviewStore:
    if not isinstance(data, dict):
        return default_review_store()
    reviews = data.get("reviews")
    if not isinstance(reviews, dict):
        return default_review_store()
    normalized_reviews = {
        str(key): deepcopy(value) for key, value in reviews.items() if isinstance(value, dict)
    }
    return {
        "reviews": normalized_reviews,
        "updated_at": data["updated_at"]
        if isinstance(data.get("updated_at"), str)
        else now_jst_iso(),
    }


def read_weekly_plan_reviews() -> WeeklyPlanReviewStore:
    data = read_gcs_json(REVIEW_FILE)
    return _normalize_review_store(data if isinstance(data, dict) else None)


def write_weekly_plan_reviews(store: WeeklyPlanReviewStore) -> None:
    store["updated_at"] = now_jst_iso()
    write_gcs_json(REVIEW_FILE, store)


def get_review(review_id: str) -> WeeklyPlanReviewPayload | None:
    return read_weekly_plan_reviews()["reviews"].get(review_id)


def upsert_review(review: WeeklyPlanReviewPayload) -> WeeklyPlanReviewPayload:
    review_id = review["review_id"]

    def _mutator(current: dict | None) -> dict:
        store = _normalize_review_store(current)
        store["reviews"][review_id] = deepcopy(review)
        store["updated_at"] = now_jst_iso()
        return store

    new_store = transactional_update(REVIEW_FILE, _mutator)
    return deepcopy(new_store["reviews"][review_id])


def update_review_status(
    review_id: str,
    status: ReviewStatus,
    **fields: object,
) -> WeeklyPlanReviewPayload | None:
    captured: dict[str, WeeklyPlanReviewPayload | None] = {"review": None}

    def _mutator(current: dict | None) -> dict:
        store = _normalize_review_store(current)
        review = store["reviews"].get(review_id)
        if review is None:
            captured["review"] = None
            store["updated_at"] = now_jst_iso()
            return store
        review["status"] = status
        for key, value in fields.items():
            review[key] = value
        store["reviews"][review_id] = review
        store["updated_at"] = now_jst_iso()
        captured["review"] = deepcopy(review)
        return store

    transactional_update(REVIEW_FILE, _mutator)
    return captured["review"]


def load_training_plan() -> dict:
    data = read_gcs_json(PLAN_FILE)
    return _normalize_training_plan(data if isinstance(data, dict) else None)


def _next_available_week_number(weekly_plan: dict[str, WeekPayload]) -> int:
    numbers = [
        value
        for key, week in weekly_plan.items()
        for value in [
            week.get("week_number")
            if isinstance(week.get("week_number"), int)
            else int(key.replace("week_", "", 1))
            if key.startswith("week_") and key.replace("week_", "", 1).isdigit()
            else None
        ]
        if isinstance(value, int)
    ]
    return max(numbers, default=0) + 1


def resolve_week_key(
    weekly_plan: dict[str, WeekPayload],
    week_start: str,
    week_number: int,
) -> tuple[str, int]:
    for key, week in weekly_plan.items():
        if week.get("week_start") == week_start:
            existing_week_number = week.get("week_number")
            if isinstance(existing_week_number, int):
                return key, existing_week_number
            return key, week_number
    candidate = f"week_{week_number}"
    if candidate not in weekly_plan:
        return candidate, week_number
    next_week_number = _next_available_week_number(weekly_plan)
    return f"week_{next_week_number}", next_week_number


class StalePlanRevisionError(Exception):
    """Raised by `replace_current_week` when the caller's expected_current_revision
    no longer matches the GCS-stored approved week. Distinct from
    `OptimisticLockError` (which signals concurrent writes); this is for
    semantic lost-update prevention when applying an older draft."""

    def __init__(self, current_revision: int | None, week_start: str | None):
        super().__init__(f"stale plan revision (current={current_revision})")
        self.current_revision = current_revision
        self.week_start = week_start


def replace_current_week(
    week: WeekPayload | dict,
    *,
    updated_by: str = "weekly_plan_agent",
    user_id: str | None = None,
    goal_event: str | None = None,
    current_phase: str | None = None,
    expected_current_revision: int | None = None,
) -> dict:
    """Atomically replace the approved week in `training_plan.json`.

    Pass `expected_current_revision` to assert the existing approved week's
    `plan_revision` matches before writing — this catches the case where
    a draft was generated against revision N but revision N+1 has been
    written since (e.g. an appended session). The check happens inside the
    transaction so it composes with the GCS generation precondition.
    """
    source_revision = week.get("plan_revision") if isinstance(week, dict) else None
    approved_week = normalize_week_payload(
        week,
        status="approved",
        plan_revision=int(source_revision) if isinstance(source_revision, int) else 1,
        updated_by=updated_by,
    )

    def _mutator(current: dict | None) -> dict:
        data = _normalize_training_plan(current)
        weekly_plan = normalize_weekly_plan(data.get("weekly_plan"))
        if expected_current_revision is not None:
            existing = next(
                (
                    w
                    for w in weekly_plan.values()
                    if w.get("week_start") == approved_week["week_start"]
                ),
                None,
            )
            current_rev = existing.get("plan_revision") if isinstance(existing, dict) else None
            if current_rev != expected_current_revision:
                raise StalePlanRevisionError(
                    current_revision=current_rev if isinstance(current_rev, int) else None,
                    week_start=approved_week["week_start"],
                )
        week_key, resolved_week_number = resolve_week_key(
            weekly_plan,
            approved_week["week_start"],
            approved_week["week_number"],
        )
        approved_week["week_number"] = resolved_week_number
        weekly_plan[week_key] = approved_week
        data["weekly_plan"] = dict(sorted(weekly_plan.items(), key=_week_sort_key))
        data["current_phase"] = current_phase or approved_week["phase"]
        data["updated_at"] = approved_week["updated_at"]
        data["updated_by"] = updated_by
        if user_id is not None:
            data["user_id"] = user_id
        if goal_event is not None:
            data["goal_event"] = goal_event
        if not isinstance(data.get("plan_id"), str):
            data["plan_id"] = f"plan_{approved_week['week_start']}"
        if not isinstance(data.get("phases"), list):
            data["phases"] = []
        return data

    return transactional_update(PLAN_FILE, _mutator)


def _normalize_training_plan(data: dict | None) -> dict:
    if isinstance(data, dict):
        copy = deepcopy(data)
        copy["weekly_plan"] = normalize_weekly_plan(copy.get("weekly_plan"))
        return copy
    return {
        "user_id": "default",
        "plan_id": f"plan_{now_jst_iso()[:10]}",
        "goal_event": "",
        "current_phase": "maintenance",
        "phases": [],
        "weekly_plan": {},
        "updated_at": now_jst_iso(),
        "updated_by": "planner",
    }


def get_current_week(
    weekly_plan: dict[str, WeekPayload],
    target_date: date,
) -> WeekPayload | None:
    target_str = target_date.isoformat()
    for _key, week in sorted(weekly_plan.items(), key=_week_sort_key):
        sessions = week.get("sessions", [])
        dates = [
            session.get("date") for session in sessions if isinstance(session.get("date"), str)
        ]
        if dates and min(dates) <= target_str <= max(dates):
            return deepcopy(week)
    return None

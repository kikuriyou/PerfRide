from contextvars import ContextVar
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from recommend_agent.config import DEFAULT_USER_ID

ActivityOverride = dict[str, object]
JST = ZoneInfo("Asia/Tokyo")

activity_override_var: ContextVar[ActivityOverride | None] = ContextVar(
    "perfride_activity_override",
    default=None,
)

as_of_var: ContextVar[datetime | None] = ContextVar(
    "perfride_as_of",
    default=None,
)

webhook_trace_id_var: ContextVar[str | None] = ContextVar(
    "perfride_webhook_trace_id",
    default=None,
)

workout_registration_result_var: ContextVar[dict[str, object] | None] = ContextVar(
    "perfride_workout_registration_result",
    default=None,
)

week_start_var: ContextVar[date | None] = ContextVar(
    "perfride_week_start",
    default=None,
)

reference_date_var: ContextVar[date | None] = ContextVar(
    "perfride_reference_date",
    default=None,
)

user_id_var: ContextVar[str] = ContextVar(
    "perfride_user_id",
    default=DEFAULT_USER_ID,
)


def normalize_user_id(user_id: str | None) -> str:
    value = (user_id or "").strip()
    if not value:
        return DEFAULT_USER_ID
    return value.replace("/", "_")


def resolve_user_id(user_id: str | None = None) -> str:
    return normalize_user_id(user_id or user_id_var.get())


def parse_as_of(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=JST)
    return parsed.astimezone(JST)


def parse_week_start(value: str | None) -> date | None:
    if not value:
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.weekday() == 0 else None


def monday_for_datetime(value: datetime) -> date:
    jst_value = value.astimezone(JST)
    return jst_value.date() - timedelta(days=jst_value.weekday())


def resolve_week_start_and_as_of(
    week_start: str | None,
    as_of: str | None,
    now: datetime | None = None,
) -> tuple[date, datetime]:
    explicit_as_of = parse_as_of(as_of)
    resolved_week_start = parse_week_start(week_start)
    if resolved_week_start is None:
        base = explicit_as_of if explicit_as_of is not None else now or datetime.now(JST)
        resolved_week_start = monday_for_datetime(base)
    effective_as_of = explicit_as_of or datetime.combine(
        resolved_week_start,
        time(hour=4, minute=0, tzinfo=JST),
    )
    return resolved_week_start, effective_as_of

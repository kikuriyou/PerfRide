from contextvars import ContextVar
from datetime import datetime

ActivityOverride = dict[str, object]

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

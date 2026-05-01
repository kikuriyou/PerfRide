"""Best-effort agent operation logging for user-visible diagnostics."""

from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from recommend_agent.gcs import append_gcs_jsonl, now_jst_iso, user_gcs_path
from recommend_agent.tools._request_context import resolve_user_id

AgentOperationStatus = Literal["triggered", "started", "completed", "error", "skipped"]


def new_operation_run_id(operation: str) -> str:
    return f"{operation}-{uuid4().hex[:12]}"


def record_agent_operation(
    *,
    status: AgentOperationStatus,
    operation: str,
    trigger: str,
    message: str,
    user_id: str | None = None,
    run_id: str | None = None,
    trace_id: str | None = None,
    session_id: str | None = None,
    activity_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Append an operation log record without affecting the agent flow."""
    try:
        resolved_user_id = resolve_user_id(user_id)
        record: dict[str, Any] = {
            "created_at": now_jst_iso(),
            "status": status,
            "operation": operation,
            "trigger": trigger,
            "message": message,
            "run_id": run_id,
            "trace_id": trace_id,
            "session_id": session_id,
            "activity_id": activity_id,
        }
        if metadata is not None:
            record["metadata"] = metadata
        append_gcs_jsonl(user_gcs_path("agent_operation_log.jsonl", resolved_user_id), record)
    except Exception as exc:
        print(f"[agent-operation-log] append failed: {exc}")

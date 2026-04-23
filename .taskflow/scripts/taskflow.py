#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Literal, cast

Phase = Literal["plan", "approval", "implement", "test", "review", "done"]
Status = Literal["pending", "in_progress", "blocked", "completed"]
Runner = Literal["claude", "codex", "human", "system"]

PHASE_VALUES: tuple[Phase, ...] = ("plan", "approval", "implement", "test", "review", "done")
STATUS_VALUES: tuple[Status, ...] = ("pending", "in_progress", "blocked", "completed")
RUNNER_VALUES: tuple[Runner, ...] = ("claude", "codex", "human", "system")
SPEC_SECTION_NAMES: tuple[str, ...] = ("what", "acceptance", "non-functional", "how", "risks")
APPROVAL_SECTION_NAMES: tuple[str, ...] = ("what", "acceptance", "non-functional")
GATE_PHASE_VALUES: tuple[Phase, ...] = ("implement", "test", "review", "done")
SOURCE_EXTENSIONS: frozenset[str] = frozenset({".py", ".ts", ".tsx", ".js", ".jsx"})
SOURCE_PREFIXES: tuple[str, ...] = ("agent/", "web/src/")
ACTIVE_TASK_FILE = ".taskflow/active-task.json"
HOST_TASKFLOW_COMMAND = "uv run --no-project python3 .taskflow/scripts/taskflow.py"
HEADING_PATTERN = re.compile(r"^#{1,6}\s+(.+?)\s*$")


class TaskflowError(ValueError):
    pass


@dataclass(frozen=True)
class TaskState:
    task_id: str
    title: str
    phase: Phase
    status: Status
    runner: Runner
    next_action: str
    artifacts: dict[str, str]
    notes: tuple[str, ...]
    updated_at: str


@dataclass(frozen=True)
class ApprovalRecord:
    task_id: str
    approved_by: str
    approved_at: str
    spec_hash: str


@dataclass(frozen=True)
class ActiveTask:
    task_id: str
    selected_at: str


@dataclass(frozen=True)
class ApprovalSummary:
    status: Literal["missing", "approved", "stale", "invalid_plan"]
    message: str
    record: ApprovalRecord | None
    expected_hash: str | None


@dataclass(frozen=True)
class GateResult:
    allowed: bool
    message: str
    task_id: str | None = None
    phase: Phase | None = None


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def timestamp() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def normalize_task_id(value: str) -> str:
    task_id = value.strip().strip("/")
    if task_id.startswith("tasks/"):
        task_id = task_id[6:]
    if not task_id or ".." in task_id:
        raise TaskflowError(f"Invalid task id: {value}")
    return task_id


def task_directory(root: Path, task_id: str) -> Path:
    return root / "tasks" / normalize_task_id(task_id)


def relative_path(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def plan_path(root: Path, task_id: str) -> Path:
    return task_directory(root, task_id) / "plan.md"


def state_path(root: Path, task_id: str) -> Path:
    return task_directory(root, task_id) / "state.json"


def approval_path(root: Path, task_id: str) -> Path:
    return task_directory(root, task_id) / "approval.json"


def reviews_path(root: Path, task_id: str) -> Path:
    return task_directory(root, task_id) / "reviews"


def result_path(root: Path, task_id: str) -> Path:
    return task_directory(root, task_id) / "result.md"


def active_task_path(root: Path) -> Path:
    return root / ACTIVE_TASK_FILE


def read_json(path: Path) -> dict[str, object]:
    try:
        raw_data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise TaskflowError(f"Missing file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise TaskflowError(f"Invalid JSON: {path}") from exc
    if not isinstance(raw_data, dict):
        raise TaskflowError(f"JSON object required: {path}")
    return raw_data


def write_json(path: Path, data: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def expect_string(data: dict[str, object], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise TaskflowError(f"{key} must be a non-empty string")
    return value


def expect_string_map(data: dict[str, object], key: str) -> dict[str, str]:
    value = data.get(key)
    if not isinstance(value, dict):
        raise TaskflowError(f"{key} must be an object")
    result: dict[str, str] = {}
    for raw_key, raw_value in value.items():
        if not isinstance(raw_key, str) or not isinstance(raw_value, str):
            raise TaskflowError(f"{key} must contain string pairs")
        if not raw_key or not raw_value:
            raise TaskflowError(f"{key} must contain non-empty strings")
        result[raw_key] = raw_value
    if not result:
        raise TaskflowError(f"{key} must not be empty")
    return result


def optional_string_list(data: dict[str, object], key: str) -> tuple[str, ...]:
    value = data.get(key)
    if value is None:
        return ()
    if not isinstance(value, list):
        raise TaskflowError(f"{key} must be an array")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise TaskflowError(f"{key} must contain non-empty strings")
        result.append(item)
    return tuple(result)


def expect_phase(data: dict[str, object], key: str) -> Phase:
    value = expect_string(data, key)
    if value not in PHASE_VALUES:
        raise TaskflowError(f"{key} must be one of {', '.join(PHASE_VALUES)}")
    return cast(Phase, value)


def expect_status(data: dict[str, object], key: str) -> Status:
    value = expect_string(data, key)
    if value not in STATUS_VALUES:
        raise TaskflowError(f"{key} must be one of {', '.join(STATUS_VALUES)}")
    return cast(Status, value)


def expect_runner(data: dict[str, object], key: str) -> Runner:
    value = expect_string(data, key)
    if value not in RUNNER_VALUES:
        raise TaskflowError(f"{key} must be one of {', '.join(RUNNER_VALUES)}")
    return cast(Runner, value)


def optional_phase(value: str | None) -> Phase | None:
    if value is None:
        return None
    if value not in PHASE_VALUES:
        raise TaskflowError(f"phase must be one of {', '.join(PHASE_VALUES)}")
    return cast(Phase, value)


def optional_status(value: str | None) -> Status | None:
    if value is None:
        return None
    if value not in STATUS_VALUES:
        raise TaskflowError(f"status must be one of {', '.join(STATUS_VALUES)}")
    return cast(Status, value)


def optional_runner(value: str | None) -> Runner | None:
    if value is None:
        return None
    if value not in RUNNER_VALUES:
        raise TaskflowError(f"runner must be one of {', '.join(RUNNER_VALUES)}")
    return cast(Runner, value)


def load_state(root: Path, task_id: str) -> TaskState:
    data = read_json(state_path(root, task_id))
    return TaskState(
        task_id=normalize_task_id(expect_string(data, "task_id")),
        title=expect_string(data, "title"),
        phase=expect_phase(data, "phase"),
        status=expect_status(data, "status"),
        runner=expect_runner(data, "runner"),
        next_action=expect_string(data, "next_action"),
        artifacts=expect_string_map(data, "artifacts"),
        notes=optional_string_list(data, "notes"),
        updated_at=expect_string(data, "updated_at"),
    )


def state_to_json(state: TaskState) -> dict[str, object]:
    return {
        "task_id": state.task_id,
        "title": state.title,
        "phase": state.phase,
        "status": state.status,
        "runner": state.runner,
        "next_action": state.next_action,
        "artifacts": state.artifacts,
        "notes": list(state.notes),
        "updated_at": state.updated_at,
    }


def load_approval(root: Path, task_id: str) -> ApprovalRecord:
    data = read_json(approval_path(root, task_id))
    spec_hash = expect_string(data, "spec_hash")
    if not re.fullmatch(r"[a-f0-9]{64}", spec_hash):
        raise TaskflowError("spec_hash must be a 64 character hex string")
    return ApprovalRecord(
        task_id=normalize_task_id(expect_string(data, "task_id")),
        approved_by=expect_string(data, "approved_by"),
        approved_at=expect_string(data, "approved_at"),
        spec_hash=spec_hash,
    )


def approval_to_json(approval: ApprovalRecord) -> dict[str, object]:
    return {
        "task_id": approval.task_id,
        "approved_by": approval.approved_by,
        "approved_at": approval.approved_at,
        "spec_hash": approval.spec_hash,
    }


def load_active_task(root: Path) -> ActiveTask | None:
    path = active_task_path(root)
    if not path.exists():
        return None
    data = read_json(path)
    return ActiveTask(
        task_id=normalize_task_id(expect_string(data, "task_id")),
        selected_at=expect_string(data, "selected_at"),
    )


def set_active_task(root: Path, task_id: str) -> None:
    write_json(
        active_task_path(root),
        {
            "task_id": normalize_task_id(task_id),
            "selected_at": timestamp(),
        },
    )


def build_default_artifacts(root: Path, task_id: str) -> dict[str, str]:
    normalized = normalize_task_id(task_id)
    return {
        "plan": relative_path(root, plan_path(root, normalized)),
        "state": relative_path(root, state_path(root, normalized)),
        "approval": relative_path(root, approval_path(root, normalized)),
        "result": relative_path(root, result_path(root, normalized)),
        "reviews": relative_path(root, reviews_path(root, normalized)),
    }


def load_plan_template(root: Path) -> str:
    template_path = root / ".taskflow" / "plan-template.md"
    return template_path.read_text(encoding="utf-8")


def ensure_plan_file(root: Path, task_id: str, title: str, force: bool) -> None:
    path = plan_path(root, task_id)
    if path.exists() and not force:
        return
    content = load_plan_template(root).replace("{TASK_TITLE}", title)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def normalize_heading(value: str) -> str:
    normalized = value.strip().lower()
    return normalized.replace("–", "-").replace("—", "-")


def extract_plan_sections(plan_text: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {}
    current_key: str | None = None
    for line in plan_text.splitlines():
        match = HEADING_PATTERN.match(line)
        if match:
            heading = normalize_heading(match.group(1))
            if heading in SPEC_SECTION_NAMES:
                current_key = heading
                sections.setdefault(current_key, [])
                continue
        if current_key is not None:
            sections[current_key].append(line)
    return {key: "\n".join(value).strip() for key, value in sections.items()}


def load_plan_sections(root: Path, task_id: str) -> dict[str, str]:
    path = plan_path(root, task_id)
    try:
        plan_text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise TaskflowError(f"Missing plan.md for task {task_id}") from exc
    return extract_plan_sections(plan_text)


def require_sections(sections: dict[str, str], names: tuple[str, ...]) -> None:
    missing = [name for name in names if not sections.get(name)]
    if missing:
        raise TaskflowError("plan.md must contain non-empty sections: " + ", ".join(missing))


def spec_hash(root: Path, task_id: str) -> str:
    sections = load_plan_sections(root, task_id)
    require_sections(sections, APPROVAL_SECTION_NAMES)
    payload = {name: sections[name] for name in APPROVAL_SECTION_NAMES}
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8"))
    return digest.hexdigest()


def summarize_approval(root: Path, task_id: str) -> ApprovalSummary:
    try:
        expected_hash = spec_hash(root, task_id)
    except TaskflowError as exc:
        return ApprovalSummary(
            status="invalid_plan",
            message=str(exc),
            record=None,
            expected_hash=None,
        )

    path = approval_path(root, task_id)
    if not path.exists():
        return ApprovalSummary(
            status="missing",
            message=(
                f"Task '{task_id}' is not approved. "
                f"Run `{HOST_TASKFLOW_COMMAND} approve --task-id {task_id} --approved-by user` "
                "after explicit user approval."
            ),
            record=None,
            expected_hash=expected_hash,
        )

    record = load_approval(root, task_id)
    if record.spec_hash != expected_hash:
        return ApprovalSummary(
            status="stale",
            message=(
                f"Task '{task_id}' approval is stale. "
                "Re-approve after updating What, Acceptance, or Non-functional."
            ),
            record=record,
            expected_hash=expected_hash,
        )

    return ApprovalSummary(
        status="approved",
        message=f"Task '{task_id}' approval is current.",
        record=record,
        expected_hash=expected_hash,
    )


def discover_in_progress_tasks(root: Path) -> list[str]:
    matches: list[str] = []
    tasks_dir = root / "tasks"
    if not tasks_dir.exists():
        return matches
    for candidate in tasks_dir.iterdir():
        if not candidate.is_dir():
            continue
        path = candidate / "state.json"
        if not path.exists():
            continue
        try:
            state = load_state(root, candidate.name)
        except TaskflowError:
            continue
        if state.status in {"in_progress", "blocked"}:
            matches.append(state.task_id)
    return sorted(matches)


def resolve_task_id(root: Path, task_id: str | None) -> str:
    if task_id:
        return normalize_task_id(task_id)
    active = load_active_task(root)
    if active is not None:
        return active.task_id
    discovered = discover_in_progress_tasks(root)
    if len(discovered) == 1:
        return discovered[0]
    if not discovered:
        raise TaskflowError("No active task. Use `init` or `resume` with --task-id first.")
    raise TaskflowError("Multiple in-progress tasks found. Specify --task-id explicitly.")


def parse_artifact(raw_value: str) -> tuple[str, str]:
    key, separator, value = raw_value.partition("=")
    if not separator or not key or not value:
        raise TaskflowError("Artifacts must use key=path")
    return key, value


def update_state(
    root: Path,
    task_id: str,
    *,
    phase: Phase | None = None,
    status: Status | None = None,
    runner: Runner | None = None,
    next_action: str | None = None,
    artifacts: list[tuple[str, str]] | None = None,
    notes: list[str] | None = None,
) -> TaskState:
    existing = load_state(root, task_id)
    merged_artifacts = dict(existing.artifacts)
    for key, value in artifacts or []:
        merged_artifacts[key] = value
    next_phase = phase or existing.phase
    next_status = status or existing.status
    if phase == "done" and status is None:
        next_status = "completed"
    if phase is not None and phase != "done" and status is None and existing.status == "completed":
        next_status = "in_progress"
    updated = TaskState(
        task_id=existing.task_id,
        title=existing.title,
        phase=next_phase,
        status=next_status,
        runner=runner or existing.runner,
        next_action=next_action or existing.next_action,
        artifacts=merged_artifacts,
        notes=existing.notes + tuple(notes or []),
        updated_at=timestamp(),
    )
    write_json(state_path(root, task_id), state_to_json(updated))
    set_active_task(root, task_id)
    return updated


def render_state_summary(root: Path, task_id: str, *, include_resume: bool) -> str:
    state = load_state(root, task_id)
    approval = summarize_approval(root, task_id)
    lines = [
        f"Task: {state.task_id}",
        f"Title: {state.title}",
        f"Phase: {state.phase}",
        f"Status: {state.status}",
        f"Runner: {state.runner}",
        f"Next action: {state.next_action}",
        f"Approval: {approval.status}",
    ]
    if state.notes:
        lines.append(f"Latest note: {state.notes[-1]}")
    for key in sorted(state.artifacts):
        lines.append(f"- {key}: {state.artifacts[key]}")
    if include_resume:
        if state.phase == "plan":
            lines.append("Suggested next step: update plan.md, then move the task to approval.")
        elif state.phase == "approval":
            lines.append(
                "Suggested next step: present What/Acceptance/Non-functional and wait for approval."
            )
        elif state.phase == "implement":
            lines.append("Suggested next step: implement the approved scope, then move to test.")
        elif state.phase == "test":
            lines.append(
                "Suggested next step: run validation, then move to review or block the task."
            )
        elif state.phase == "review":
            lines.append("Suggested next step: review the change, fix findings, or close the task.")
        else:
            lines.append("Suggested next step: summarize the result or start a new task.")
    return "\n".join(lines)


def classify_source_path(root: Path, file_path: str) -> tuple[bool, str]:
    path = Path(file_path)
    resolved = path.resolve() if path.is_absolute() else (root / path).resolve()
    try:
        relative = resolved.relative_to(root.resolve()).as_posix()
    except ValueError:
        return False, ""
    suffix = PurePosixPath(relative).suffix.lower()
    if suffix not in SOURCE_EXTENSIONS:
        return False, relative
    if not any(relative.startswith(prefix) for prefix in SOURCE_PREFIXES):
        return False, relative
    return True, relative


def evaluate_gate(root: Path, file_path: str, task_id: str | None = None) -> GateResult:
    should_gate, relative = classify_source_path(root, file_path)
    if not should_gate:
        return GateResult(True, f"{relative or file_path} is outside the taskflow gate.")

    try:
        resolved_task_id = resolve_task_id(root, task_id)
    except TaskflowError as exc:
        return GateResult(False, str(exc))

    try:
        state = load_state(root, resolved_task_id)
    except TaskflowError as exc:
        return GateResult(False, str(exc), task_id=resolved_task_id)

    approval = summarize_approval(root, resolved_task_id)
    if approval.status != "approved":
        return GateResult(False, approval.message, task_id=resolved_task_id, phase=state.phase)

    if state.phase not in GATE_PHASE_VALUES:
        return GateResult(
            False,
            (
                f"Task '{resolved_task_id}' is in phase '{state.phase}'. "
                "Source edits are allowed only after approval in implement/test/review/done."
            ),
            task_id=resolved_task_id,
            phase=state.phase,
        )

    return GateResult(
        True,
        f"Task '{resolved_task_id}' is approved for source edits in phase '{state.phase}'.",
        task_id=resolved_task_id,
        phase=state.phase,
    )


def command_init(args: argparse.Namespace) -> int:
    root = repo_root()
    task_id = normalize_task_id(args.task_id)
    title = args.title.strip() if isinstance(args.title, str) and args.title.strip() else task_id
    directory = task_directory(root, task_id)
    directory.mkdir(parents=True, exist_ok=True)
    reviews_path(root, task_id).mkdir(parents=True, exist_ok=True)
    ensure_plan_file(root, task_id, title, force=args.force_template)

    state = TaskState(
        task_id=task_id,
        title=title,
        phase="plan",
        status="in_progress",
        runner=cast(Runner, args.runner),
        next_action=(
            args.next_action or "Fill What, Acceptance, Non-functional, How, and Risks in plan.md."
        ),
        artifacts=build_default_artifacts(root, task_id),
        notes=(),
        updated_at=timestamp(),
    )
    write_json(state_path(root, task_id), state_to_json(state))
    set_active_task(root, task_id)
    print(render_state_summary(root, task_id, include_resume=True))
    return 0


def command_status(args: argparse.Namespace) -> int:
    root = repo_root()
    task_id = resolve_task_id(root, args.task_id)
    if args.json:
        state = load_state(root, task_id)
        approval = summarize_approval(root, task_id)
        payload: dict[str, object] = state_to_json(state)
        payload["approval_status"] = approval.status
        payload["approval_message"] = approval.message
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0
    print(render_state_summary(root, task_id, include_resume=False))
    return 0


def command_resume(args: argparse.Namespace) -> int:
    root = repo_root()
    task_id = resolve_task_id(root, args.task_id)
    set_active_task(root, task_id)
    if args.json:
        state = load_state(root, task_id)
        approval = summarize_approval(root, task_id)
        payload: dict[str, object] = state_to_json(state)
        payload["approval_status"] = approval.status
        payload["approval_message"] = approval.message
        payload["active_task"] = task_id
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0
    print(render_state_summary(root, task_id, include_resume=True))
    return 0


def command_approve(args: argparse.Namespace) -> int:
    root = repo_root()
    task_id = resolve_task_id(root, args.task_id)
    hash_value = spec_hash(root, task_id)
    approval = ApprovalRecord(
        task_id=task_id,
        approved_by=args.approved_by,
        approved_at=timestamp(),
        spec_hash=hash_value,
    )
    write_json(approval_path(root, task_id), approval_to_json(approval))
    state = update_state(
        root,
        task_id,
        phase="implement",
        status="in_progress",
        next_action=args.next_action or "Implement the approved scope.",
    )
    print(render_state_summary(root, state.task_id, include_resume=True))
    return 0


def command_advance(args: argparse.Namespace) -> int:
    root = repo_root()
    task_id = resolve_task_id(root, args.task_id)
    artifacts = [parse_artifact(value) for value in args.artifact]
    phase = optional_phase(args.phase)
    status = optional_status(args.status)
    runner = optional_runner(args.runner)
    update_state(
        root,
        task_id,
        phase=phase,
        status=status,
        runner=runner,
        next_action=args.next_action,
        artifacts=artifacts,
        notes=args.note,
    )
    print(render_state_summary(root, task_id, include_resume=True))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Shared taskflow controller.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="Create or reset task state.")
    init_parser.add_argument("--task-id", required=True)
    init_parser.add_argument("--title", default="")
    init_parser.add_argument("--runner", choices=RUNNER_VALUES, default="claude")
    init_parser.add_argument("--next-action", default="")
    init_parser.add_argument("--force-template", action="store_true")
    init_parser.set_defaults(func=command_init)

    status_parser = subparsers.add_parser("status", help="Show task state.")
    status_parser.add_argument("--task-id")
    status_parser.add_argument("--json", action="store_true")
    status_parser.set_defaults(func=command_status)

    resume_parser = subparsers.add_parser("resume", help="Activate and show a task.")
    resume_parser.add_argument("--task-id")
    resume_parser.add_argument("--json", action="store_true")
    resume_parser.set_defaults(func=command_resume)

    approve_parser = subparsers.add_parser("approve", help="Store approval for the current spec.")
    approve_parser.add_argument("--task-id")
    approve_parser.add_argument("--approved-by", required=True)
    approve_parser.add_argument("--next-action", default="")
    approve_parser.set_defaults(func=command_approve)

    advance_parser = subparsers.add_parser("advance", help="Update task phase or next action.")
    advance_parser.add_argument("--task-id")
    advance_parser.add_argument("--phase", choices=PHASE_VALUES)
    advance_parser.add_argument("--status", choices=STATUS_VALUES)
    advance_parser.add_argument("--runner", choices=RUNNER_VALUES)
    advance_parser.add_argument("--next-action")
    advance_parser.add_argument("--artifact", action="append", default=[])
    advance_parser.add_argument("--note", action="append", default=[])
    advance_parser.set_defaults(func=command_advance)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except TaskflowError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

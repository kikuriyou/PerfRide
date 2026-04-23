# Taskflow

`.taskflow/` is the shared workflow contract for Claude and Codex.

## Source Of Truth

Each task lives in `tasks/<task-id>/` and uses these artifacts:

- `plan.md`: spec-driven task plan
- `state.json`: current phase, runner, and `next_action`
- `approval.json`: explicit approval for `What`, `Acceptance`, and `Non-functional`
- `result.md` or `reviews/`: output artifacts after implementation

## Plan Contract

`plan.md` must contain these sections:

- `What`
- `Acceptance`
- `Non-functional`
- `How`
- `Risks`

Approval covers only `What`, `Acceptance`, and `Non-functional`.
`How` may change during implementation if `state.json` is updated with the new `next_action` and a short note.

Use `.taskflow/plan-template.md` when creating a new task.

## State Machine

Allowed phases:

- `plan`
- `approval`
- `implement`
- `test`
- `review`
- `done`

Allowed statuses:

- `pending`
- `in_progress`
- `blocked`
- `completed`

`next_action` must always describe the next concrete step.

## Commands

Initialize or resume a task:

```bash
uv run --no-project python3 .taskflow/scripts/taskflow.py init --task-id <task-id> --title "<title>"
uv run --no-project python3 .taskflow/scripts/taskflow.py resume --task-id <task-id>
```

Advance the phase or update `next_action`:

```bash
uv run --no-project python3 .taskflow/scripts/taskflow.py advance --task-id <task-id> --phase implement --next-action "Run tests for the approved change"
```

Record a short note when `How` changes after approval:

```bash
uv run --no-project python3 .taskflow/scripts/taskflow.py advance --task-id <task-id> --note "Adjusted How: narrowed the change to the shared hook wrapper"
```

Record approval after explicit user approval:

```bash
uv run --no-project python3 .taskflow/scripts/taskflow.py approve --task-id <task-id> --approved-by user
```

Check whether source edits are allowed:

```bash
uv run --no-project python3 .taskflow/scripts/check_plan_gate.py --file-path agent/src/example.py
```

## Gate Rules

Source edits in `agent/` and `web/src/` are blocked unless all of these are true:

- an active or explicit task exists
- `approval.json` exists
- the stored `spec_hash` matches the current `What`, `Acceptance`, and `Non-functional`
- `state.json.phase` is `implement`, `test`, `review`, or `done`

Docs, task artifacts, `.claude/`, `.codex/`, and `.taskflow/` are outside this gate.

## Claude And Codex

- Claude reads `CLAUDE.md`, then uses `.claude/skills/*` and `.claude/hooks/*` as adapters to `.taskflow/`
- Codex reads `.codex/AGENTS.md`, then uses `.taskflow/scripts/*.py` directly when needed
- Both must update `state.json` before ending a phase
- Both should append a short `state.json.notes` entry when `How` changes after approval

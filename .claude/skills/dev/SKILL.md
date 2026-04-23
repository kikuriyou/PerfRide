---
name: dev
description: |
  Advance one shared taskflow phase at a time while keeping state.json current.
metadata:
  short-description: Shared taskflow phase runner
---

# Dev

Move exactly one taskflow phase forward for $ARGUMENTS and stop with an updated `next_action`.

```
/dev <task description or task-id>
```

## Start

1. Read `.taskflow/workflow.md`.
2. Resolve the task:
   - Existing task: `uv run --no-project python3 .taskflow/scripts/taskflow.py resume --task-id <task-id>`
   - New task: pick `tasks/YYYYMMDD_<slug>/`, run `init`, then move into `/plan`
3. Read `tasks/<task-id>/state.json` and `plan.md`.

## Phase Rules

### `plan`

- Draft or refine the spec-driven `plan.md`
- When the plan is ready, move to approval:

```bash
uv run --no-project python3 .taskflow/scripts/taskflow.py advance --task-id <task-id> --phase approval --next-action "Present What, Acceptance, and Non-functional for approval."
```

- Stop and show the plan to the user

### `approval`

- Present only `What`, `Acceptance`, and `Non-functional`
- Wait for explicit user approval
- After approval, record it:

```bash
uv run --no-project python3 .taskflow/scripts/taskflow.py approve --task-id <task-id> --approved-by user
```

- Do not edit `agent/` or `web/src/` before approval

### `implement`

- Implement only the approved scope
- If `How` changes after approval, record a short note:

```bash
uv run --no-project python3 .taskflow/scripts/taskflow.py advance --task-id <task-id> --note "Adjusted How: <short reason>"
```

- Update the plan checkboxes as work finishes
- When the implementation slice is ready, move to test

### `test`

- Run the relevant checks for the changed area
- If checks fail, fix them or set `status=blocked`
- If checks pass, move to review

### `review`

- Run `/review`
- Fix Critical/High findings before closing
- If the change is ready, move to `done` and write `result.md`

### `done`

- Summarize changes, validation, and remaining risks
- Update `tasks/lessons.md` if the user corrected the work

## Rules

- Always update `state.json` before finishing
- If the phase is unclear, run `status` or `resume` first
- Use `/codex:rescue` when the plan or fix requires deeper reasoning

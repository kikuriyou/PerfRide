# Workflow

Use `.taskflow/workflow.md` as the shared workflow contract for Claude and Codex.
Keep `tasks/<task-id>/state.json` current and always end a phase with a concrete `next_action`.

## Task Lifecycle

1. Initialize or resume a task with `.taskflow/scripts/taskflow.py`.
2. Write `plan.md` with `What`, `Acceptance`, `Non-functional`, `How`, and `Risks`.
3. Record explicit approval before editing source files.
4. Advance through `implement` → `test` → `review` → `done`.
5. Record results and lessons after the task closes.

## Claude Adapters

These adapters sit on top of `.taskflow/`:

| Adapter | Role |
|-------|------|
| `/dev` | Move one phase forward and update task state |
| `/plan` | Draft the spec-driven `plan.md` |
| `enforce-plan-review.py` | Blocks source edits without a valid approved task |
| `lint-on-save.py` | Format, lint, and type-check changed Python files |
| `auto-test-after-impl.py` | Run tests after larger source changes |

## Recovery

- If the current phase is unclear, run `taskflow.py status` or `resume`.
- If approval is stale, update the spec sections and run `approve` again.
- If blocked, set `status=blocked` and write the unblock step in `next_action`.
- If root cause is unclear, delegate to `codex-debugger`.

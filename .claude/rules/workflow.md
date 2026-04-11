# Workflow

## Task Lifecycle

For non-trivial tasks: plan in `tasks/YYYYMMDD/todo.md` → verify with user → track progress → document results → update `tasks/lessons.md` after corrections.

Use `/dev <task>` to automate the full cycle (plan → review → implement → test → review).

## Automated by Hooks

These phases are enforced automatically — no need to remember manually:

| Phase | Hook | Behavior |
|-------|------|----------|
| Lint | `lint-on-save.py` | Python files auto-formatted on save |
| Plan review gate | `enforce-plan-review.py` | Warns if implementation starts without plan approval |
| Test execution | `auto-test-after-impl.py` | Runs tests after 3+ files or 100+ lines changed |

## Recovery Protocol

When blocked, STOP — do not retry blindly.

| Situation             | Action                                   |
| --------------------- | ---------------------------------------- |
| Clear error           | Fix directly                             |
| Unclear root cause    | Delegate to `codex-debugger`             |
| Wrong approach        | Re-enter plan mode, propose alternatives |
| Missing information   | Ask user with specific options (A/B/C)   |
| External dependency   | Document blocker, suggest workaround     |

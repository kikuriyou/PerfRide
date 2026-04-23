---
name: plan
description: Create or update a spec-driven task plan before coding.
disable-model-invocation: true
---

# Create Spec-Driven Plan

Create or update `tasks/<task-id>/plan.md` for $ARGUMENTS.

## Before Writing

1. Read `.taskflow/workflow.md` and `.taskflow/plan-template.md`.
2. Inspect the relevant code, tests, docs, and task artifacts.
3. If the task directory does not exist yet, initialize it first:

```bash
uv run --no-project python3 .taskflow/scripts/taskflow.py init --task-id <task-id> --title "<title>"
```

## Required Sections

`plan.md` must contain:

```markdown
## Task: {Title}

## What

- Goal:
- Scope:
- Non-goal:

## Acceptance

- [ ] User-visible outcome:
- [ ] Validation command or manual check:

## Non-functional

- Security:
- Compatibility:
- Observability:
- Performance:

## How

### Phase 1: {Title}

- [ ] {Investigation or implementation step}
- [ ] {Verification or handoff step}

## Risks

- {Main risk}
- {Rollback or mitigation}
```

Approval covers only `What`, `Acceptance`, and `Non-functional`.
`How` may change after approval if `state.json.next_action` is updated and a short note is appended.

## After Writing

Move the task to approval:

```bash
uv run --no-project python3 .taskflow/scripts/taskflow.py advance --task-id <task-id> --phase approval --next-action "Present What, Acceptance, and Non-functional for approval."
```

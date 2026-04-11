---
name: dev
description: |
  Full development cycle: plan → plan review → implement → test → review.
  Single command to execute all phases with minimal user intervention.
  User approval required only at plan review phase.
metadata:
  short-description: Auto dev cycle (plan → review → implement → test → review)
---

# Dev

**Full development cycle meta-skill. Plan from $ARGUMENTS, get approval, implement, test, review -- all in one command.**

```
/dev <task description>

Phase 1: PLAN
  /plan を使用。複雑なタスクは /codex:rescue で相談
    ↓
Phase 2: PLAN REVIEW  ← ユーザー承認必須
  /codex:adversarial-review でプランの弱点を検証 → 結果をユーザーに提示
    ↓
Phase 3: IMPLEMENT
  テストがない → テストを先に書く → 実装 → テスト実行
  テストがある → そのまま実装
    ↓
Phase 4: TEST
  変更領域に応じたテスト実行 (max 3 retries)
    ↓
Phase 5: REVIEW LOOP (max 3 iterations)
  /review 実行
  ├─ Critical/High の指摘あり → 修正 → Phase 4 (re-test) → Phase 5 に戻る
  └─ 指摘なし → Final Report に移行
  ※ 3回ループしても残る場合はユーザーに判断を委ねる
    ↓
FINAL REPORT
  変更ファイル、テスト結果、レビュー結果
  + Lessons Learned (修正・指摘があれば tasks/lessons.md に追記)
  + ドキュメント更新が必要な場合は注記
```

---

## Phase 1: PLAN

**Analyze $ARGUMENTS and create implementation plan.**

1. Read relevant files (Glob/Grep/Read)
2. Identify affected areas (frontend `src/`, agent `agent/`, or both)
3. Check `.claude/docs/` for existing context

**Scale decision:**

| Task Complexity | Action |
|-----------------|--------|
| 3+ steps or design decisions | `/codex:rescue` でプラン策定を委譲 |
| Simple (1-2 steps, obvious) | Plan inline |

Write plan to `tasks/YYYYMMDD/plan.md` as a checkable list:

```markdown
## Task: {task title}

### Plan

- [ ] Step 1: {description} (`{file(s)}`)
- [ ] Step 2: ...

### Notes

- {Key design decisions}
- {Risks or caveats}
```

---

## Phase 2: PLAN REVIEW (MANDATORY GATE)

**Present the plan to the user and wait for explicit approval.**

1. `/codex:adversarial-review` を実行してプランの弱点・リスク・設計上の問題を検証
2. Present the plan + Codex feedback to the user:

```markdown
## Plan: {task title}

### Steps ({N} items)
{step list}

### Codex Review
{summary of Codex feedback}

---
Options:
1. **Approve** — proceed to implementation
2. **Request changes** — returns to Phase 1
3. **Reject** — stop
```

- **Do NOT proceed to Phase 3 without explicit user approval**
- If changes requested: update plan and re-present

---

## Phase 3: IMPLEMENT

**Execute the approved plan step by step.**

### Test-First Logic

```
Existing tests for the change area?
  ├─ No  → Write tests first → Implement → Run tests
  └─ Yes → Implement directly → Run tests
```

For each step:

1. **Read before write** -- understand existing code patterns
2. **Implement the change** -- follow codebase conventions
3. **Mark complete** -- update checkbox in tasks/YYYYMMDD/plan.md

---

## Phase 4: TEST

**Run tests based on which files were changed.**

| Changed Area | Test Command |
|-------------|-------------|
| `agent/` only | `cd agent && uv run pytest -v` |
| `src/` only | `npm run build` + `npm run test` |
| Both | Run both sets |

### Failure Handling (max 3 attempts)

```
Test failure → Analyze error → Fix → Re-test
  ↓ (still failing after 3 attempts)
STOP: Report to user with error details
```

- Do NOT retry blindly with the same change
- After 3 failures: present error details and ask user

---

## Phase 5: REVIEW LOOP (max 3 iterations)

**Review the implementation for quality and security.**

```
Run /review
  ↓
Critical/High issues found?
  ├─ Yes → Fix → Phase 4 (re-test) → Phase 5 again
  └─ No  → Proceed to Final Report
```

- Max 3 review iterations
- If issues remain after 3 loops: present remaining issues to user for decision

---

## Final Report

```markdown
## Done: {task title}

### Changed Files
{output of `git diff --stat`}

### Test Results
- Agent: {PASS/FAIL/SKIP}
- Frontend build: {PASS/FAIL/SKIP}
- Frontend tests: {PASS/FAIL/SKIP}

### Review Results
- Iterations: {N}
- Findings: {N} issues found, {N} fixed
- Remaining: {list or "None"}

### Lessons Learned
{修正・指摘があれば tasks/lessons.md にも追記}

### Documentation
{ドキュメント更新が必要な場合は注記}
```

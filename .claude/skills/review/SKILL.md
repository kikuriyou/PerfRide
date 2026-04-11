---
name: review
description: |
  Code review with parallel subagents: simplify + security + Codex logic review.
  Use after implementation to catch quality, security, and logic issues.
  Trigger: "review", "code review", "check this implementation"
metadata:
  short-description: Parallel code review (simplify + security + Codex)
---

# Review

**Multi-perspective code review using /simplify and parallel subagents.**

Review $ARGUMENTS (or recent changes if no arguments).

---

## Step 1: Run /simplify

Execute `/simplify` on the target code for code quality and refactoring suggestions.

---

## Step 2: Parallel Subagents

Launch two subagents in parallel:

### Security Reviewer (Agent: Explore)

Spawn an Explore agent with Read/Grep only:

- Check for OWASP Top 10 vulnerabilities (injection, XSS, etc.)
- Check for hardcoded secrets, credentials, API keys
- Check input validation at system boundaries
- Check for insecure dependencies or configurations
- Report findings with file:line references

### Codex Reviewer (via /codex plugin)

Run two Codex reviews in parallel:

1. **`/codex:review`** — standard review (logic correctness, edge cases, API contracts)
2. **`/codex:adversarial-review`** — challenge review (security, design flaws, race conditions, data loss)

Both run with `--background`. Use `/codex:status` to poll, `/codex:result` to retrieve.

---

## Step 3: Synthesize Results

Combine results from all three sources and report:

```markdown
## Review Results

### Critical
{issues that must be fixed before merge}

### High
{issues that should be fixed}

### Medium
{suggestions for improvement}

### Low
{minor style or preference items}

### Summary
- /simplify: {N} suggestions
- Security: {N} findings
- Codex: {N} findings
- Total: {N} issues ({N} critical, {N} high)
```

If no issues found at any severity, report "No issues found."

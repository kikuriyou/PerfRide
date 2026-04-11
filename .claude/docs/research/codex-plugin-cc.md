# OpenAI Codex Plugin for Claude Code

> Research date: 2026-04-03
> Source: https://github.com/openai/codex-plugin-cc
> Version: 1.0.2

## Overview

The Codex plugin integrates OpenAI's Codex directly into Claude Code, enabling code
reviews and task delegation without leaving your workflow. It uses your local Codex CLI
authentication and applies the same configuration as direct Codex usage.

## Requirements

- ChatGPT subscription or OpenAI API key (usage counts toward Codex limits)
- Node.js 18.18+
- Local Codex CLI installation (`npm install -g @openai/codex`)

## Installation

```bash
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
```

## Commands (7 total)

### 1. `/codex:setup`

**Purpose:** Check whether the local Codex CLI is ready and optionally toggle the
stop-time review gate.

**Syntax:**
```
/codex:setup [--enable-review-gate|--disable-review-gate]
```

**Behavior:**
- Runs `codex-companion.mjs setup --json` to check Codex availability
- If Codex is unavailable and npm is available, asks whether to install it
- If Codex is installed but not authenticated, guides user to run `!codex login`
- Can enable/disable the automatic stop-review-gate (see Hooks section)

**When to use:** First-time setup, verifying installation, toggling review gate.

---

### 2. `/codex:review`

**Purpose:** Run a standard read-only Codex code review against local git state.

**Syntax:**
```
/codex:review [--wait|--background] [--base <ref>] [--scope auto|working-tree|branch]
```

**Behavior:**
- `--wait`: Run review immediately in foreground
- `--background`: Run review as a background task
- No flag: Estimates review scope first, recommends background for >1-2 files
- Invokes `codex-companion.mjs review "$ARGUMENTS"`
- Returns output verbatim without modification
- **Review-only** -- no fixes, patches, or change suggestions

**Scope options:**
- `auto` (default): Plugin decides based on git state
- `working-tree`: Reviews all uncommitted changes
- `branch`: Reviews all commits since `--base` ref

**When to use:** Standard code review of your working changes or branch before committing/merging.

---

### 3. `/codex:adversarial-review`

**Purpose:** Run a steerable challenge review that questions chosen implementation,
design choices, tradeoffs, and assumptions.

**Syntax:**
```
/codex:adversarial-review [--wait|--background] [--base <ref>] [--scope auto|working-tree|branch] [focus text]
```

**Behavior:**
- Same execution modes as `/codex:review` (wait/background/interactive)
- Focuses on "whether the current approach is the right one, what assumptions it
  depends on, and where the design could fail"
- Targets high-risk areas: authentication, data loss, race conditions, error handling
- Uses a dedicated adversarial-review prompt template with `{{TARGET_LABEL}}`,
  `{{USER_FOCUS}}`, and `{{REVIEW_INPUT}}` variables
- Returns findings ordered by severity
- **Review-only** -- does not suggest fixes

**When to use:** Pressure-testing critical changes before shipping. Best for
security-sensitive code, architectural decisions, data integrity paths.

---

### 4. `/codex:rescue`

**Purpose:** Delegate investigation, fix requests, or follow-up work to the Codex
rescue subagent.

**Syntax:**
```
/codex:rescue [--background|--wait] [--resume|--fresh] [--model <model|spark>] [--effort <none|minimal|low|medium|high|xhigh>] [what Codex should investigate, solve, or continue]
```

**Behavior:**
- Routes request to the `codex:codex-rescue` subagent
- Subagent is a thin forwarder: one Bash call to `codex-companion.mjs task ...`
- Default execution: foreground (unlike review commands)
- `--resume`: Continue current Codex thread (no prompt)
- `--fresh`: Start a new Codex thread (no prompt)
- No flag: Checks for resumable thread, asks user to choose continue vs. new
- `--model spark` maps to `gpt-5.3-codex-spark`
- `--effort` controls reasoning effort (none/minimal/low/medium/high/xhigh)
- Adds `--write` by default for editable runs
- Returns Codex output verbatim without commentary

**When to use:**
- Debugging complex issues that need deep investigation
- Multi-step implementation tasks
- When Claude is blocked and needs a different approach
- Follow-up work on previous Codex results

---

### 5. `/codex:status`

**Purpose:** Show active and recent Codex jobs for this repository, including
review-gate status.

**Syntax:**
```
/codex:status [job-id] [--wait] [--timeout-ms <ms>] [--all]
```

**Behavior:**
- Without job ID: Renders a compact Markdown table of current and past runs
- With job ID: Presents full command output without condensing
- Shows job ID, kind, status, phase, elapsed/duration, summary, follow-up commands

**When to use:** Checking progress of background reviews or rescue tasks.

---

### 6. `/codex:result`

**Purpose:** Show the stored final output for a finished Codex job.

**Syntax:**
```
/codex:result [job-id]
```

**Behavior:**
- Displays complete job results: verdict, summary, findings, details, artifacts, next steps
- Preserves exact file paths and line numbers
- Shows error/parse error messages if any
- Suggests follow-up commands

**When to use:** Retrieving results from completed background jobs.

---

### 7. `/codex:cancel`

**Purpose:** Cancel an active background Codex job in this repository.

**Syntax:**
```
/codex:cancel [job-id]
```

**Behavior:**
- Terminates the specified running background job
- Simple passthrough to `codex-companion.mjs cancel`

**When to use:** Stopping a long-running background review or task that is no longer needed.

---

## Internal Skills (3 total, not user-invocable)

### codex-cli-runtime
Teaches Claude how to invoke the `codex-companion.mjs task` helper correctly.
Rules: one Bash call, return stdout verbatim, never inspect repo independently,
`spark` -> `gpt-5.3-codex-spark`, `--write` by default.

### codex-result-handling
Teaches Claude how to present Codex output to users. Rules: preserve structure
verbatim, findings ordered by severity, never auto-fix without user approval,
report failures instead of guessing, direct to `/codex:setup` for auth issues.

### gpt-5-4-prompting
Internal guidance for composing Codex/GPT-5.4 prompts. Architecture: `<task>` block,
output contract, `<default_follow_through_policy>`, verification contract, grounding
rules. Treat Codex as an operator receiving instructions, not a collaborator.

## Hooks (Lifecycle)

### SessionStart / SessionEnd
Runs `session-lifecycle-hook.mjs` at session boundaries (5s timeout each).

### Stop (Review Gate)
Runs `stop-review-gate-hook.mjs` (900s timeout) at session stop. Conducts a
stop-gate review of the immediately previous Claude turn:
- Only reviews turns that involved actual code changes
- Non-edit turns get automatic ALLOW
- Code-change turns are analyzed for second-order failures, empty-state behavior,
  retries, stale state, rollback risks, design tradeoffs
- Output: first line is exactly ALLOW or BLOCK with brief reason
- Enable/disable via `/codex:setup --enable-review-gate` / `--disable-review-gate`

## Configuration

Configuration via `config.toml` at user or project level:
- `model`: Default model for rescue tasks
- `model_reasoning_effort`: Default reasoning effort level

## Architecture

```
plugins/codex/
  .claude-plugin/plugin.json    # Plugin manifest (v1.0.2)
  agents/codex-rescue.md        # Rescue subagent definition
  commands/                     # 7 command definitions (.md files)
  hooks/hooks.json              # Lifecycle hook config
  prompts/                      # Prompt templates
    adversarial-review.md       # Adversarial review system prompt
    stop-review-gate.md         # Stop-gate review prompt
  schemas/
    review-output.schema.json   # Review output JSON schema
  scripts/                      # Runtime scripts
    codex-companion.mjs         # Main companion runtime
    session-lifecycle-hook.mjs  # Session hooks
    stop-review-gate-hook.mjs   # Review gate hook
  skills/                       # Internal skills (not user-invocable)
    codex-cli-runtime/SKILL.md
    codex-result-handling/SKILL.md
    gpt-5-4-prompting/SKILL.md
```

## Best Practices

1. **Start with `/codex:setup`** to verify everything works before using other commands.
2. **Use `/codex:review` for standard reviews**, `/codex:adversarial-review` for
   security/architecture pressure-testing.
3. **Prefer `--background` for large reviews** (>1-2 files). Check with `/codex:status`.
4. **Use `/codex:rescue` for delegation**, not simple tasks Claude can handle directly.
   Best for deep debugging, multi-step fixes, and when Claude is stuck.
5. **Thread management with rescue**: Use `--resume` for follow-ups on the same thread,
   `--fresh` to start clean. Without flags, the plugin checks for resumable threads.
6. **Model selection**: Use `--model spark` (maps to gpt-5.3-codex-spark) for faster,
   lighter tasks. Leave unset for default model.
7. **Reasoning effort**: Leave `--effort` unset unless you specifically need to control it.
   Options range from `none` to `xhigh`.
8. **Review gate**: Enable with `/codex:setup --enable-review-gate` for automatic
   stop-time code review of Claude's changes. Adds ~15min max overhead but catches
   second-order issues.
9. **After review findings, STOP**: Do not auto-fix. Ask users which issues to address.
10. **Output is verbatim**: All commands return Codex output exactly as-is. Do not
    paraphrase, summarize, or add commentary.

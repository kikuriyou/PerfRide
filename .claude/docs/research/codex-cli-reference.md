# OpenAI Codex CLI — Complete Reference

> Researched 2026-04-03 from official docs and GitHub.

## 1. CLI Commands & Subcommands

### `codex` (Interactive TUI)
Launches the interactive terminal UI. Accepts a prompt or opens empty.

### `codex exec` (alias: `codex e`)
Non-interactive mode. Runs a task, streams progress to stderr, outputs final message to stdout.

### `codex exec resume [SESSION_ID]`
Resumes a previous exec session. Flags:
- `--last` — resume most recent session from current directory
- `--all` — consider sessions from any directory (not just cwd)
- `PROMPT` — optional follow-up instruction appended to resumed session
- `--image, -i` — attach images to follow-up prompt

### `codex resume`
Interactive resume. Same `--last`, `--all`, `SESSION_ID` options.

### `codex app`
Launches Codex Desktop (macOS).

### `codex cloud` (alias: `codex cloud-tasks`)
Interacts with Codex Cloud tasks. Subcommands: `list`.

### `codex apply` (alias: `codex a`)
Applies latest diff from a Codex Cloud task to local repo.

### `codex completion`
Generates shell completions (bash/zsh/fish/powershell/elvish).

### `codex fork`
Forks a previous interactive session into a new thread.

### `codex login` / `codex logout`
Authentication management. `--device-auth`, `--with-api-key`.

### `codex mcp`
Manages MCP servers. Subcommands: `add`, `get`, `list`, `login`, `logout`.

### `codex mcp-server`
Runs Codex itself as an MCP server over stdio.

### `codex sandbox`
Runs commands under Codex sandbox policies (for testing).

### `codex features`
Manages feature flags. Subcommands: `enable`, `disable`, `list`.

### `codex execpolicy`
Evaluates execution policy rule files against commands.

---

## 2. Global Flags (All Commands)

| Flag | Type | Description |
|------|------|-------------|
| `--model, -m` | string | Override model (e.g., `gpt-5.4`, `gpt-5-codex`) |
| `--sandbox, -s` | `read-only` / `workspace-write` / `danger-full-access` | Sandbox policy |
| `--full-auto` | bool | Shortcut: `--sandbox workspace-write --ask-for-approval on-request` |
| `--ask-for-approval, -a` | `untrusted` / `on-request` / `never` | Approval policy |
| `--cd, -C` | path | Set working directory |
| `--add-dir` | path | Grant additional directory write access |
| `--config, -c` | key=value | Override config (repeatable) |
| `--profile, -p` | string | Load named config profile |
| `--image, -i` | path[,path...] | Attach image files |
| `--search` | bool | Enable live web search |
| `--oss` | bool | Use local Ollama provider |
| `--enable` / `--disable` | feature | Toggle feature flags |
| `--no-alt-screen` | bool | Disable alternate screen in TUI |
| `--dangerously-bypass-approvals-and-sandbox` / `--yolo` | bool | No sandbox, no approvals |

## 3. `codex exec` Specific Flags

| Flag | Description |
|------|-------------|
| `--ephemeral` | Don't persist session files to disk |
| `--json` / `--experimental-json` | Output JSONL events to stdout |
| `--output-last-message, -o <path>` | Write final message to file |
| `--output-schema <path>` | JSON Schema for structured output validation |
| `--skip-git-repo-check` | Allow running outside a Git repo |
| `--color` | `always` / `never` / `auto` |
| `PROMPT` / `-` | Task instruction (use `-` for stdin) |

---

## 3. Sandbox Modes Detail

| Mode | Behavior |
|------|----------|
| `read-only` | Browse only. Approval needed for edits, commands, network. |
| `workspace-write` | Read/edit/run commands in working directory automatically. Network blocked by default. |
| `workspace-write` + network | Add `[sandbox_workspace_write] network_access = true` in config |
| `danger-full-access` | No sandbox, full filesystem and network. Not recommended. |

---

## 4. --resume Behavior

- Sessions are stored in `~/.codex/sessions/`
- `codex exec resume --last "follow-up prompt"` continues the most recent session
- `codex exec resume <SESSION_ID>` targets a specific session
- `--all` includes sessions from other directories
- Resume restores: transcripts, plan history, approvals, dynamic tools
- `--ephemeral` sessions are NOT resumable (not persisted)
- Archived sessions go to `~/.codex/archived_sessions/`
- Interactive: `codex resume` or `/resume` slash command

---

## 5. AGENTS.md Convention

### Purpose
Persistent instructions loaded before every task. Like a briefing document.

### Resolution Order (per directory, root to cwd)
1. `AGENTS.override.md` (if exists)
2. `AGENTS.md`
3. Fallback filenames from `project_doc_fallback_filenames` config

### Scope Hierarchy
1. **Global**: `~/.codex/AGENTS.override.md` or `~/.codex/AGENTS.md`
2. **Project**: From Git root walking down to cwd, one file per directory
3. Files concatenate; later (closer to cwd) supplements earlier

### Constraints
- Max combined size: 32 KiB (configurable via `project_doc_max_bytes`)
- One file per directory
- Empty files ignored
- Rebuilt once per run (TUI launch or exec invocation)

### Override Mechanism
`.override.md` suffix creates temporary replacement without deleting base file.

### Customizing Fallback Names
```toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
```

### Verify
```bash
codex --ask-for-approval never "Summarize current instructions"
```

---

## 6. .codex/ Directory Convention

### Standard Files
```
~/.codex/                       # CODEX_HOME (global)
├── config.toml                 # User config
├── AGENTS.md                   # Global agent instructions
├── AGENTS.override.md          # Temporary global override
├── auth.json                   # Credentials
├── sessions/                   # Session transcripts
├── archived_sessions/          # Archived sessions
├── log/                        # Logs (codex-tui.log)
└── skills/                     # Global skills

.codex/                         # Project-scoped (repo root)
├── config.toml                 # Project config overrides
├── AGENTS.md                   # (Usually at repo root, not in .codex/)
└── skills/                     # Project-specific skills
    └── <skill-name>/
        ├── SKILL.md            # Required: skill definition
        ├── scripts/            # Optional: executable scripts
        ├── references/         # Optional: docs
        └── assets/             # Optional: templates
```

### Config Precedence (highest to lowest)
1. CLI flags and `--config` overrides
2. Profile values (`--profile <name>`)
3. Project config (`.codex/config.toml`, closest wins; trusted projects only)
4. User config (`~/.codex/config.toml`)
5. System config (`/etc/codex/config.toml`)
6. Built-in defaults

### Project Trust
Untrusted projects skip `.codex/config.toml` entirely — only user/system/defaults apply.

---

## 7. Skills System

### SKILL.md Format
```yaml
---
name: skill-name
description: When this skill should and should not trigger.
---

Instructions for Codex to follow.
```

### Discovery Locations (priority order)
1. `.agents/skills` in cwd
2. `.agents/skills` in parent directories up to repo root
3. `$HOME/.agents/skills` (user global)
4. `/etc/codex/skills` (admin/system)
5. Bundled skills

### Loading Strategy
Progressive disclosure: only metadata loaded initially; full SKILL.md loaded when activated.

### Invocation
- **Explicit**: `/skills` command or `$skill-name` mention
- **Implicit**: Codex auto-matches task to skill description

### Configuration
```toml
[[skills.config]]
path = ".codex/skills/context-loader"
enabled = true
```

---

## 8. Context Management

### How Context is Assembled
1. AGENTS.md files (concatenated, root to cwd)
2. Skills metadata (lazy-loaded)
3. Repository code (sandboxed)
4. Task prompt
5. Session history (on resume)

### Context Window
~192,000 tokens capacity.

### Session Persistence
- CLI/Browser: session-scoped (fresh sandbox per task)
- Desktop App: persistent context across sessions
- Resume restores full transcript + plan history

### Key Strategies
- Layer: global AGENTS.md → project AGENTS.md → directory AGENTS.md → Skills → prompt
- Keep AGENTS.md current
- Use specific instructions over vague guidance
- Include code examples for preferred style
- Use Skills for reusable workflows

---

## 9. Slash Commands (Interactive)

| Command | Purpose |
|---------|---------|
| `/permissions` | Set what Codex can do without asking |
| `/agent` | Switch between agent threads |
| `/apps` | Browse connectors |
| `/clear` | Clear terminal, fresh chat |
| `/compact` | Summarize to preserve context tokens |
| `/copy` | Copy latest output |
| `/diff` | Show git diff including untracked |
| `/exit` / `/quit` | Exit |
| `/experimental` | Toggle experimental features |
| `/feedback` | Submit diagnostics |
| `/init` | Generate AGENTS.md scaffold |
| `/mcp` | List MCP tools |
| `/mention` | Attach file to conversation |
| `/model` | Choose model and reasoning effort |
| `/fast` | Toggle Fast mode for GPT-5.4 |
| `/plan` | Switch to plan mode |
| `/personality` | Choose response style |
| `/ps` | Display background terminals |
| `/fork` | Branch session into new thread |
| `/resume` | Continue previous session |
| `/new` | New conversation in same session |
| `/review` | Working tree analysis |
| `/status` | Session config and token usage |
| `/debug-config` | Print config diagnostics |
| `/skills` | Browse and invoke skills |

---

## 10. CI/CD Usage

```bash
# Basic
codex exec "summarize repo structure" | tee summary.md

# With structured output
codex exec "Extract metadata" --output-schema ./schema.json -o ./output.json

# Ephemeral (no session persistence)
codex exec --ephemeral "triage and suggest next steps"

# Full auto with JSON events
codex exec --full-auto --json "fix lint errors" | jq

# Auth in CI
CODEX_API_KEY=<key> codex exec --json "triage bug reports"
```

---

## Sources

- https://developers.openai.com/codex/cli/reference
- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/cli/features
- https://developers.openai.com/codex/config-advanced
- https://developers.openai.com/codex/config-reference
- https://developers.openai.com/codex/config-basic
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/cli/slash-commands
- https://github.com/openai/codex

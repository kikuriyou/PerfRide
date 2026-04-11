# Project Design Document

> This document tracks design decisions made during conversations.
> Updated automatically by the `design-tracker` skill.

## Overview

Claude Code (Opus 4.6, 200K context) is the orchestrator. Codex CLI (/codex plugin 経由) で planning/design/complex code、subagents (Opus) で code implementation と codebase exploration を担当。

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Claude Code Lead (Opus 4.6 — 200K context)                │
│  Role: Orchestration, user interaction, task management     │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐       │
│  │ Subagents (Opus)      │  │ /codex plugin         │       │
│  │ (isolated + results)  │  │ (gpt-5.4)             │       │
│  │                       │  │                       │       │
│  │ general-purpose       │  │ /codex:rescue          │       │
│  │ Explore (codebase)    │  │ /codex:review          │       │
│  │ codex-debugger        │  │ /codex:adversarial-    │       │
│  │                       │  │          review        │       │
│  └──────────────────────┘  └──────────────────────┘       │
└────────────────────────────────────────────────────────────┘
```

### Agent Roles

| Agent                    | Role                              | Responsibilities                                       |
| ------------------------ | --------------------------------- | ------------------------------------------------------ |
| Claude Code (Main)       | Overall orchestration             | User interaction, task management, simple code edits   |
| general-purpose (Opus)   | Implementation & Codex delegation | Code implementation, /codex delegation, file operations|
| Explore (Opus)           | Codebase exploration              | File search, code search, codebase understanding       |
| codex-debugger (Opus)    | Error analysis                    | /codex:rescue for root cause analysis and fixes        |
| /codex plugin (gpt-5.4)  | Planning & complex implementation | Architecture design, code review, debugging            |

## Implementation Plan

### Patterns & Approaches

| Pattern    | Purpose                          | Notes                                                       |
| ---------- | -------------------------------- | ----------------------------------------------------------- |
| Subagents  | Isolated tasks returning results | Implementation, codebase exploration, review                |
| /codex     | Deep reasoning tasks             | /codex:rescue, /codex:review, /codex:adversarial-review     |
| Skill Flow | /dev → /review cycle             | plan → implement → test → review loop                       |

### Libraries & Roles

| Library              | Role                           | Notes                                                 |
| -------------------- | ------------------------------ | ----------------------------------------------------- |
| /codex plugin        | Planning, design, complex code | Architecture, planning, debug, complex implementation |

### Key Decisions

| Decision                                                          | Rationale                                                                                             | Alternatives Considered                                  | Date       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| `.claude` is the source of truth for AI context; `CLAUDE.md` and `.codex/AGENTS.md` are generated entrypoints | Keeps Claude/Codex aligned while minimizing duplicate maintenance and reducing drift risk              | Hand-maintained duplicates; automatic bidirectional merge | 2026-03-19 |
| Gemini CLI removed from dev toolchain                             | Authentication issues; Claude native tools (Read, Grep, Explore subagent, WebSearch) cover the use cases | Keep Gemini CLI (blocked by auth)                        | 2026-04-03 |
| All subagents default to Opus                                     | 200K context makes quality of reasoning more important than context size; Opus provides better output | Sonnet (cheaper but 200K same as Opus, weaker reasoning) | 2026-02-19 |
| Agent Teams default model changed to Opus                         | Consistent with subagent model selection; better reasoning for parallel tasks                         | Sonnet (cheaper)                                         | 2026-02-19 |
| Claude Code context corrected to 200K                             | 1M is Beta/pay-as-you-go only; most users have 200K; design must work for common case                 | Assume 1M (only works for Tier 4+ users)                 | 2026-02-19 |
| Subagent delegation threshold lowered to ~20 lines                | 200K context requires more aggressive context management                                              | 50 lines (was based on 1M assumption)                    | 2026-02-19 |
| Codex role unchanged (planning + complex code)                    | Codex excels at deep reasoning for both design and implementation                                     | Keep Codex advisory-only                                 | 2026-02-17 |
| /startproject split into 3 skills                                 | Separation of Plan/Implement/Review gives user control gates                                          | Single monolithic skill                                  | 2026-02-08 |
| Agent Teams for Research ↔ Design                                 | Bidirectional communication enables iterative refinement                                              | Sequential subagents (old approach)                      | 2026-02-08 |
| Agent Teams for parallel implementation                           | Module-based ownership avoids file conflicts                                                          | Single-agent sequential implementation                   | 2026-02-08 |
| Skills 17→5, Hooks 16→4 に削減                                   | ベストプラクティス6件の原則に基づき過剰なハーネスを削除                                               | そのまま維持                                             | 2026-04-03 |
| Agent Teams 削除                                                  | 個人プロジェクトにはトークンコスト3倍以上で過剰。サブエージェントで十分                               | Agent Teams を維持（コスト過大）                         | 2026-04-03 |
| codex exec → /codex plugin に移行                                 | Claude Code プラグインとして統合され、セッション管理・レビュー機能が充実                             | codex exec 直接呼び出しを維持                            | 2026-04-03 |
| AGENTS.md にコンテキストをインライン化                             | context-loader スキルの tool call 6回を 0 に削減、発火確実性の問題も解消                              | context-loader スキルを維持                              | 2026-04-03 |

## TODO

- [ ] /dev スキルの end-to-end テスト
- [ ] /review スキルの end-to-end テスト
- [ ] AGENTS.md インライン後のサイズ監視（32 KiB 上限）

## Open Questions

- [ ] /codex:rescue の --resume をどの程度活用するか（/dev の Phase 間で使うべきか）
- [ ] DESIGN.md が大きくなった場合の AGENTS.md サイズ管理戦略

## Changelog

| Date       | Changes                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| 2026-04-03 | Skills 17→5, Hooks 16→4: ベストプラクティスに基づく大規模クリーンアップ。Agent Teams, Gemini CLI 削除。codex exec → /codex plugin 移行。AGENTS.md インライン化 |
| 2026-04-03 | Gemini CLI removed: auth issues; roles absorbed by Claude native tools + Explore subagent                      |
| 2026-03-19 | Added generated AI entrypoint workflow: `.claude` is canonical, `CLAUDE.md` and `.codex/AGENTS.md` are derived |
| 2026-02-19 | Context-aware redesign: Claude=200K, Gemini=1M (codebase+research+multimodal), all subagents/teams→Opus      |
| 2026-02-17 | Role clarification: Gemini → multimodal only, Codex → planning + complex code, Subagents → external research |
| 2026-02-08 | Major redesign for Opus 4.6: 1M context, Agent Teams, skill pipeline                                         |
|            | Initial                                                                                                      |

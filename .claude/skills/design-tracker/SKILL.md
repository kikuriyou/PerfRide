---
name: design-tracker
description: |
  Track and document project design decisions in .claude/docs/DESIGN.md.
  Activate when detecting architecture discussions, implementation decisions,
  pattern choices, library selections. Also use when user says "record this",
  "update design", "record this decision", "what's our design status".
---

# Design Tracker Skill

Manage `.claude/docs/DESIGN.md` — track architecture decisions, implementation plans, library choices, and open questions.

## When to Activate

- User discusses architecture or design patterns
- User makes implementation decisions (e.g., "let's use ReAct pattern")
- User says "record this", "add to design", "update design", "record this decision"
- User asks "what's our current design?" or "what have we decided?"
- Important technical decisions are made during conversation

## Workflow

### Recording Decisions

1. Read `.claude/docs/DESIGN.md`
2. Extract the decision from conversation
3. Update the appropriate section
4. Add entry to Changelog with today's date

### Explicit Update (from conversation)

When invoked directly (e.g., "update design with X"):

1. Read `.claude/docs/DESIGN.md`
2. Identify target section from context
3. Add or update the entry
4. Confirm what was recorded

### Section Mapping

| Conversation Topic           | Target Section                      |
| ---------------------------- | ----------------------------------- |
| Overall goals, purpose       | Overview                            |
| System structure, components | Architecture                        |
| Patterns (ReAct, etc.)       | Implementation Plan > Patterns      |
| Library choices              | Implementation Plan > Libraries     |
| Why we chose X over Y        | Implementation Plan > Key Decisions |
| Things to implement later    | TODO                                |
| Unresolved questions         | Open Questions                      |

## Output

Confirm in Japanese: what was recorded, which section, brief summary.

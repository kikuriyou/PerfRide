# PerfRide Knowledge Base

Project documentation index. For architecture overview, see [ARCHITECTURE.md](../ARCHITECTURE.md).

## Product Specs (`product-specs/`)

| Document                                                                           | Description                                    |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| [specification.md](product-specs/specification.md)                               | Core product specification                     |
| [implementation-specification.md](product-specs/implementation-specification.md) | Implementation details and technical decisions |
| [team-specification.md](product-specs/team-specification.md)                     | Team roles and collaboration spec              |

## References (`references/`)

| Document                                                    | Description                                |
| ----------------------------------------------------------- | ------------------------------------------ |
| [development-steps.md](references/development-steps.md) | Step-by-step development history |

---

## Documentation Map

| Location           | Purpose                                                                             |
| ------------------ | ----------------------------------------------------------------------------------- |
| `docs/`            | Project knowledge base (specs, references, images) -- for all developers and agents |
| `.claude/docs/`    | Claude Code operational docs (delegation strategies, playbooks, research)           |
| `.claude/rules/`   | Claude Code per-session rules (compressed)                                          |
| `tasks/`           | Short-term work tracking (todo.md, lessons.md)                                      |
| `agent/knowledge/` | Python recommendation agent runtime domain knowledge                                |

## Future Extensions

The following will be added when needed:

- `docs/design-docs/` -- when 3+ design documents accumulate
- `QUALITY_SCORE.md` -- when quality gaps become visible
- Doc hygiene agent -- after CI infrastructure stabilizes

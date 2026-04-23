Cycling performance app: Strava integration, segment analysis, ride simulation, pace optimization.

## Monorepo Structure

- **`web/`:** Next.js / React / TypeScript / ESLint — see `web/package.json`
- **`agent/`:** Python / Google ADK / FastAPI — see `agent/pyproject.toml`
- See `README.md`, `ARCHITECTURE.md`, and `docs/index.md` for product and architecture details

## Commands

```bash
# Frontend
cd web && npm run dev
cd web && npm run build
cd web && npm run lint
cd web && npm run test

# Agent (always use uv, never pip)
cd agent && uv run pytest -v
cd agent && uv run ruff check .
cd agent && uv run ruff format --check .

# Full stack
docker compose up
```

## Key Conventions

- Frontend imports use `@/*` alias (maps to `web/src/*`)
- `web/next.config.ts` keeps `output: "standalone"` for Docker
- Agent env uses `GOOGLE_GENAI_USE_VERTEXAI=true` (see `.claude/context/local-env.md` for project ID)
- Claude hooks run Python via `uv run --no-project python3`
- Frontend tests use Vitest and live in `__tests__/` directories

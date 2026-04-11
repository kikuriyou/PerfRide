# Architecture

PerfRide is a monorepo with two stacks: a Next.js frontend (`web/`) and a Python recommendation agent (`agent/`).

## High-Level Data Flow

```
Browser (Client Components)
    │
    ├── /api/auth/*  ──→  Strava OAuth 2.0
    ├── /api/activities, /api/segments  ──→  Strava API v3
    ├── /api/geocode  ──→  Nominatim (OpenStreetMap)
    ├── /api/recommend  ──→  Python Agent (:8000)
    │                           ├── GCS (activity_cache.json)
    │                           ├── Local knowledge files
    │                           ├── Google Search (grounding)
    │                           └── Gemini 2.5 Flash (via ADK)
    │
    └── Dashboard SSR  ──→  Strava API (activities)
                        ──→  GCS write (activity_cache.json)  [fire-and-forget]
```

**GCS as shared data bus**: Dashboard writes `activity_cache.json` + `schema.json` to a GCS bucket (configured via `GCS_BUCKET` env var). The Python agent reads these to access rider data without direct Strava API access.

## Frontend (web/)

### Pages (App Router)

| Route             | Auth    | Description                                                           |
| ----------------- | ------- | --------------------------------------------------------------------- |
| `/`               | No      | Landing page with feature cards                                       |
| `/dashboard`      | Yes     | Strava activities, fitness chart (CTL/ATL/TSB), recommendations       |
| `/simulator`      | Partial | Quick-simulate (public), starred segments + map search (auth)         |
| `/simulator/[id]` | Yes     | Individual segment simulation                                         |
| `/optimizer`      | Partial | Pace optimizer with preset courses (public) or Strava segments (auth) |
| `/planner`        | No      | Periodized training plan generator                                    |
| `/settings`       | Yes     | FTP, weight, max HR, training goal                                    |

### API Routes

| Route                          | Auth | Description                                    |
| ------------------------------ | ---- | ---------------------------------------------- |
| `/api/auth/[...nextauth]`      | —    | NextAuth.js handler (Strava OAuth)             |
| `/api/activities/[id]/streams` | Yes  | Proxy to Strava activity streams               |
| `/api/segments/explore`        | Yes  | Proxy to Strava segment explore (bounding box) |
| `/api/segments/streams`        | Yes  | Segment details + elevation/distance streams   |
| `/api/geocode`                 | No   | Forward geocoding via Nominatim                |
| `/api/recommend`               | No   | POST proxy to Python agent                     |

### Core Libraries

| Module           | Location                                  | Description                                                           |
| ---------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Auth             | `web/src/lib/auth.ts`                         | NextAuth.js config, Strava OAuth, JWT token refresh                   |
| Strava Client    | `web/src/lib/strava.ts`                       | Typed wrapper for Strava API v3                                       |
| Settings         | `web/src/lib/settings.tsx`                    | React context for user settings (localStorage)                        |
| Physics Engine   | `web/src/app/simulator/_lib/physics.ts`       | Power-balance climbing simulation (gravity, drag, rolling resistance) |
| Pace Optimizer   | `web/src/app/optimizer/_lib/paceOptimizer.ts` | NP-constrained pacing optimization (Sports Engineering 2025)          |
| Training Planner | `web/src/app/planner/_lib/planner.ts`         | Periodization engine (Base → Build → Peak → Taper)                    |
| GCS Cache        | `web/src/app/dashboard/_lib/gcs.ts`           | Server-side activity cache writer                                     |
| Strava Cache     | `web/src/lib/strava-cached.ts`                | 2-layer cache for Strava data (unstable_cache)                        |

### Components

Feature-colocated in `web/src/app/<feature>/_components/`. Key shared components in `web/src/components/`: Header, LoginButton, ThemeToggle, HelpTooltip, WorkoutChart.

Charts use Recharts. Maps use Leaflet (SSR-disabled via `dynamic()`). Styling is custom CSS variables (light/dark themes), no CSS-in-JS or Tailwind.

### Key Boundaries

- **Server vs Client**: All `page.tsx` are Server Components (call `getServerSession()`, fetch data). All interactive UI is `'use client'` components receiving data as props.
- **Auth vs Public**: Auth enforced at page/route level via `getServerSession()` — no middleware.
- **Providers**: `web/src/app/providers.tsx` wraps app in `SessionProvider` (NextAuth) + `SettingsProvider`.

## Agent (agent/)

### Structure

```
agent/
├── src/recommend_agent/
│   ├── agent.py          # Google ADK Agent (gemini-2.5-flash)
│   ├── main.py           # FastAPI server (POST /recommend, GET /health)
│   ├── constants.py      # Shared constants (GCS bucket, cache settings)
│   ├── prompts/
│   │   ├── system_prompt.md  # Expert cycling coach persona
│   │   └── system_prompt_generic.md  # Generic fallback prompt
│   ├── tools/
│   │   ├── get_recent_activities.py  # Read activity cache from GCS
│   │   ├── get_expert_knowledge.py   # Read local knowledge files
│   │   └── search_latest_knowledge.py # Google Search grounding (domain-restricted)
│   └── cache/                # File-based recommendation cache
├── knowledge/            # 6 curated training science files
│   ├── power_zones.md, periodization.md, workout_templates.md
│   ├── fatigue_models.md, sequencing_examples.md, dynamic_fitness.md
└── tests/
    ├── test_tools.py     # Knowledge tool tests
    └── test_cache_logic.py  # Cache regeneration logic tests
```

### Cache Strategy

Recommendations are cached with daily generation limits (max 2/day). Time-based regeneration rules: 0 days → cache, 1-3 days → regenerate, 4-6 → cache, 7 → regenerate, 8+ → cache. Cache invalidated when GCS activity data changes.

## Deployment

| Component | Runtime                     | Port                    |
| --------- | --------------------------- | ----------------------- |
| Frontend  | Node.js (standalone output) | 3000 (dev), 8080 (prod) |
| Agent     | Python + uvicorn            | 8000                    |

Both services run via `docker-compose.yml`. Production deployment to Google Cloud Run via `deploy.sh`.

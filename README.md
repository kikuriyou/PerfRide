# PerfRide 🚴

A performance management toolkit for road cyclists, powered by the [Strava API](https://developers.strava.com/).

Simulate climbs, optimize race pacing, plan periodized training, and track your fitness — all in one app.

## Features

### 📊 Dashboard

Connect with Strava to view your recent rides, weekly training summary, and fitness progress chart (CTL / ATL / TSB). Includes per-ride detail with heart rate zones, power profile, and elevation overlay.

### 🏔️ Climb Simulator

Predict climbing times based on power, weight, and real segment data. Uses physics-based simulation (air resistance, rolling resistance, drivetrain loss). Search segments by map or use your Strava starred segments.

### 🎯 Pace Optimizer

Calculate optimal pacing strategy for time trials based on course elevation profile. Based on the research paper _"A numerical design methodology for optimal pacing strategy in the individual time trial discipline of cycling"_ (Sports Engineering, 2025).

### 📅 Training Planner

Generate periodized training plans for your target race. Automatically creates structured workouts across Base → Build 1 → Build 2 → Peak → Taper phases, with power zone-based workout prescriptions.

### ⚙️ Settings

Configure your FTP, weight, and max heart rate. Values are stored locally and used across all features.

## Prerequisites

- **Node.js** 20 or later
- **Strava API Application** — [Create one here](https://www.strava.com/settings/api)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/kikuriyou/PerfRide.git
cd PerfRide

# Install dependencies
cd web && npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your Strava API credentials

# Start frontend only
npm run dev

# Start full stack (frontend + AI agent)
cd .. && docker-compose up
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Copy `web/.env.local.example` to `web/.env.local` and fill in the values:

| Variable                  | Description                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| `STRAVA_CLIENT_ID`        | Your Strava API application client ID                                   |
| `STRAVA_CLIENT_SECRET`    | Your Strava API application client secret                               |
| `NEXTAUTH_SECRET`         | Random secret for NextAuth.js (generate with `openssl rand -base64 32`) |
| `NEXTAUTH_URL`            | App URL for local dev (`http://localhost:3000`)                         |
| `NEXTAUTH_URL_PRODUCTION` | Production URL (used by `deploy.sh`)                                    |

> **Note:** Make sure to add your app's callback URL (`http://localhost:3000/api/auth/callback/strava`) in the [Strava API settings](https://www.strava.com/settings/api).

## Project Structure

```
web/src/
├── app/
│   ├── api/                    # API routes
│   │   ├── auth/[...nextauth]/ # Strava OAuth (NextAuth.js)
│   │   ├── activities/[id]/streams/ # Activity stream proxy
│   │   ├── segments/explore/   # Segment search proxy
│   │   ├── segments/streams/   # Segment elevation proxy
│   │   ├── geocode/            # Nominatim geocoding
│   │   └── recommend/          # Python agent proxy
│   ├── dashboard/              # Dashboard (Strava integration)
│   │   ├── _components/        # ActivityCharts, FitnessChart, FitnessChartWrapper, RecommendCard, RideCard
│   │   └── _lib/gcs.ts        # GCS activity cache writer
│   ├── simulator/              # Climb simulator & segment detail
│   │   ├── _components/        # SimulatorForm, SegmentMap, SegmentCard, SegmentSearchWrapper
│   │   └── _lib/physics.ts    # Physics simulation engine
│   ├── optimizer/              # Pace optimizer
│   │   ├── _components/        # PaceOptimizerForm
│   │   └── _lib/paceOptimizer.ts # Pacing optimization algorithm
│   ├── planner/                # Training planner
│   │   ├── _components/        # PlannerForm
│   │   └── _lib/planner.ts    # Periodization engine
│   └── settings/               # User settings
│       └── _components/        # SettingsForm
├── components/                 # Shared components
│   ├── Header.tsx, LoginButton.tsx, ThemeToggle.tsx
│   ├── HelpTooltip.tsx, WorkoutChart.tsx
│   └── ...
├── lib/                        # Shared logic
│   ├── auth.ts                # NextAuth.js configuration
│   ├── strava.ts              # Strava API client
│   ├── strava-cached.ts       # 2-layer Strava data cache
│   └── settings.tsx           # Client-side settings context
└── types/                      # TypeScript type definitions
```

> For full architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Deployment (Google Cloud Run)

```bash
# Copy and configure deploy script
cp deploy.sh.example deploy.sh
# Edit PROJECT_ID, REGION, and other settings in deploy.sh

# Deploy
./deploy.sh
```

The deploy script will:

1. Build a Docker image locally
2. Push to Google Artifact Registry
3. Deploy to Cloud Run with environment variables

## Strava Webhook (Local Development)

Use `strava-webhook.sh` to manage Strava webhook subscriptions via ngrok:

```bash
# Start ngrok tunnel
ngrok http 3000

# List current subscriptions
./strava-webhook.sh list

# Create subscription with ngrok URL
./strava-webhook.sh create https://xxxx.ngrok-free.app/api/strava/webhook

# Delete subscription
./strava-webhook.sh delete
```

Credentials are read from `web/.env.local` automatically.

## Weekly Plan (Local Development)

Once the agent is running on `http://localhost:8000`, you can reproduce any Monday weekly draft locally:

```bash
curl -X POST http://localhost:8000/api/agent/weekly-plan \
  -H 'Content-Type: application/json' \
  -d '{
    "week_start": "2026-04-27",
    "as_of": "2026-04-27T04:00:00+09:00",
    "force": true
  }'
```

- Omit `as_of` to use `week_startT04:00:00+09:00`
- Weekly review actions are handled via `POST /api/agent/weekly-plan/respond`
- `deploy.sh.example` also includes the Cloud Scheduler job definition for the weekly trigger

## Tech Stack

| Category           | Technology                                                                         |
| ------------------ | ---------------------------------------------------------------------------------- |
| **Framework**      | [Next.js](https://nextjs.org/) 16 (App Router, TypeScript)                         |
| **UI**             | React 19                                                                           |
| **Authentication** | [NextAuth.js](https://next-auth.js.org/) + Strava OAuth 2.0                        |
| **Charts**         | [Recharts](https://recharts.org/)                                                  |
| **Maps**           | [Leaflet](https://leafletjs.com/) + [React-Leaflet](https://react-leaflet.js.org/) |
| **Geocoding**      | [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap)                  |
| **Deployment**     | [Google Cloud Run](https://cloud.google.com/run) + Docker                          |

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

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
cd web
npm install
cd ..

# Set up environment variables
cp web/.env.local.example web/.env.local
cp agent/.env.example agent/.env
# Edit both files with your Strava and Google Cloud settings

# Start frontend only
cd web
npm run dev

# Start full stack (frontend + AI agent)
cd .. && docker-compose up
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Copy `web/.env.local.example` to `web/.env.local` and fill in the values:

| Variable                       | Description                                                             |
| ------------------------------ | ----------------------------------------------------------------------- |
| `STRAVA_CLIENT_ID`             | Your Strava API application client ID                                   |
| `STRAVA_CLIENT_SECRET`         | Your Strava API application client secret                               |
| `STRAVA_WEBHOOK_VERIFY_TOKEN`  | Verify token used when creating Strava webhook subscriptions            |
| `NEXTAUTH_SECRET`              | Random secret for NextAuth.js (generate with `openssl rand -base64 32`) |
| `NEXTAUTH_URL`                 | App URL for local dev (`http://localhost:3000`)                         |
| `NEXTAUTH_URL_PRODUCTION`      | Production web URL used by `deploy.sh`                                  |
| `GCS_BUCKET`                   | Shared GCS bucket for cache and plan data                               |
| `GOOGLE_CLOUD_PROJECT`         | Google Cloud project for GCS and Cloud Run                              |
| `AGENT_API_URL`                | Agent base URL (`http://localhost:8000`, `http://agent:8000`, or Cloud Run URL) |
| `AGENT_AUDIENCE`               | ID token audience for private Cloud Run agent calls                     |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Optional Web Push public key                                            |
| `VAPID_PRIVATE_KEY`            | Optional Web Push private key                                           |
| `LINE_CHANNEL_ACCESS_TOKEN`    | Optional LINE notification token                                        |
| `KMS_KEY_NAME`                 | Optional Cloud KMS key for user credential encryption                   |

Copy `agent/.env.example` to `agent/.env` for local agent development:

| Variable                  | Description                                                |
| ------------------------- | ---------------------------------------------------------- |
| `GCS_BUCKET`              | Shared GCS bucket                                          |
| `GOOGLE_GENAI_USE_VERTEXAI` | Set to `true` for Vertex AI-backed Gemini                |
| `GOOGLE_CLOUD_PROJECT`    | Google Cloud project                                       |
| `GOOGLE_CLOUD_LOCATION`   | Vertex AI location, usually `global`                       |
| `WEB_API_URL`             | Web base URL (`http://localhost:3000`, `http://web:3000`, or production URL) |
| `RECOMMEND_MODE`          | `hybrid`, `web_only`, or `no_grounding`                    |
| `USE_PERSONAL_DATA`       | `true` or `false`                                          |
| `WORKOUT_PLATFORM`        | Defaults to `intervals_icu`; valid values are `intervals_icu`, `mywhoosh_direct`, and `zwift` |
| `INTERVALS_ICU_API_KEY`   | Local fallback only. Production should use Settings UI credentials |
| `INTERVALS_ICU_ATHLETE_ID` | Intervals.icu athlete id for local fallback, usually `0` |
| `MYWHOOSH_EMAIL` / `MYWHOOSH_PASSWORD` | Legacy MyWhoosh direct-upload fallback only |

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

PerfRide is deployed as two Cloud Run services:

| Service          | Access  | Runtime | Purpose |
| ---------------- | ------- | ------- | ------- |
| `perfride-web`   | Public  | Next.js | Browser app, Strava OAuth, web API routes |
| `perfride-agent` | Private | FastAPI | Recommendations, weekly plan generation, workout registration |

`web` calls `agent` through `AGENT_API_URL`. In production, the agent service should use `--no-allow-unauthenticated`, and the web service account should have `roles/run.invoker` on the agent service. App-level secrets such as `STRAVA_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `VAPID_PRIVATE_KEY`, and `LINE_CHANNEL_ACCESS_TOKEN` should be passed from Secret Manager where possible.

```bash
# Copy and configure deploy script
cp deploy.sh.example deploy.sh
# Edit PROJECT_ID, REGION, service names, service accounts, and optional Secret Manager mappings

# Optional but recommended for the weekly Cloud Scheduler job:
# use the production Strava athlete id whose weekly plan should be generated.
export SCHEDULER_USER_ID=your_strava_athlete_id

# Deploy
./deploy.sh all
```

`deploy.sh` also accepts `web` or `agent` when you only want to redeploy one service. For the current project deployment, the local script keeps the existing Cloud Run service names (`perfride` and `perfride-agent`); override `WEB_SERVICE_NAME` or `AGENT_SERVICE_NAME` if your project uses different names.

The deploy script will:

1. Load `web/.env.local` and `agent/.env`
2. Build `agent/` and `web/` Docker images locally
3. Push both images to Artifact Registry
4. Deploy the private agent service
5. Deploy the public web service with `AGENT_API_URL` and `AGENT_AUDIENCE`
6. Grant the web runtime service account and Scheduler service account `roles/run.invoker` on the private agent service
7. Create or update the weekly Cloud Scheduler job against the agent endpoint with a JSON request body

Post-deploy smoke tests:

```bash
# Public web should respond.
curl -I https://your-web-domain.example.com/

# Agent should reject unauthenticated public access when private.
curl -i https://your-agent-run-url.a.run.app/health

# Verify from Cloud Run logs that web can call POST /api/recommend.
# Verify Strava OAuth callback and webhook subscription after callback domains are updated.
```

Workout registration now uses Intervals.icu planned workouts by default. Users save an Intervals.icu API key in Settings, PerfRide stores it with KMS-backed encryption, and MyWhoosh receives the workout when the user enables Intervals.icu Read Calendar in MyWhoosh Connections. In local Docker Compose, `INTERVALS_ICU_API_KEY` and `INTERVALS_ICU_ATHLETE_ID` in `agent/.env` act as a local fallback. Do not set those envs in production unless you intentionally want a single shared override.

MyWhoosh direct upload remains available only as `WORKOUT_PLATFORM=mywhoosh_direct` for legacy fallback. Production should not require `MYWHOOSH_EMAIL` or `MYWHOOSH_PASSWORD`.

Before Intervals.icu API keys can be saved, create the KMS key referenced by `KMS_KEY_NAME` and grant IAM:

```bash
PROJECT_ID=your-gcp-project-id
KMS_LOCATION=asia-northeast1
KMS_KEYRING=perfride
KMS_KEY=user-credentials

gcloud services enable cloudkms.googleapis.com --project "$PROJECT_ID"
gcloud kms keyrings create "$KMS_KEYRING" --project "$PROJECT_ID" --location "$KMS_LOCATION"
gcloud kms keys create "$KMS_KEY" \
  --project "$PROJECT_ID" \
  --location "$KMS_LOCATION" \
  --keyring "$KMS_KEYRING" \
  --purpose encryption
```

For local Docker Compose testing, grant your ADC account dev-key encrypt/decrypt permission:

```bash
LOCAL_ACCOUNT=$(gcloud config get-value account)
gcloud kms keys add-iam-policy-binding "$KMS_KEY" \
  --project "$PROJECT_ID" \
  --location "$KMS_LOCATION" \
  --keyring "$KMS_KEYRING" \
  --member "user:$LOCAL_ACCOUNT" \
  --role "roles/cloudkms.cryptoKeyEncrypterDecrypter"
```

Intervals.icu setup:

1. Create an API key in [Intervals.icu Settings](https://intervals.icu/settings) > Developer Settings.
2. Save it in PerfRide Settings and run Test connection.
3. In [MyWhoosh Profile](https://event.mywhoosh.com/user/profile) > Connections, enable Intervals.icu Read Calendar. See the [MyWhoosh partner connection docs](https://mywhoosh.com/docs/partner-connections/) if the menu is hard to find.

After registration, MyWhoosh calendar sync can take a few minutes.

In Cloud Run, grant `perfride-web` only `roles/cloudkms.cryptoKeyEncrypter` and `perfride-agent` only `roles/cloudkms.cryptoKeyDecrypter`. See [development steps](docs/references/development-steps.md) for full commands.

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

Once the agent is running on `http://localhost:8000`, you can reproduce any Monday weekly plan locally:

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
- In `coach` mode, the weekly plan is saved directly as the current week in `training_plan.json`
- In `suggest` / `observe`, the weekly scheduler skips automatic reflection
- The weekly scheduler does not register external workouts; post-ride replacement still requires user approval
- `deploy.sh.example` also includes the Cloud Scheduler job definition for the weekly trigger (`04:00` Monday in `Asia/Tokyo`)
- Set `SCHEDULER_USER_ID` before deployment if the scheduler should generate a plan for a specific production athlete id.

### Local Weekly Scheduler

Local development can run the same weekly endpoint from Docker Compose. This is separate from Google Cloud Scheduler and is opt-in:

```bash
# Start the full local stack, including the local weekly scheduler.
docker compose up -d --build

# Or set a temporary verification time, for example Monday 10:00 JST, and start it.
scripts/local-weekly-scheduler.sh up 10:00

# Verify on another weekday, for example Thursday 12:15 JST.
scripts/local-weekly-scheduler.sh up thu 12:15

# Change the configured local time without starting containers.
scripts/local-weekly-scheduler.sh set mon 04:00

# Watch scheduler logs.
scripts/local-weekly-scheduler.sh logs
```

The scheduler reads these optional values from `agent/.env`:

```bash
LOCAL_WEEKLY_PLAN_DAY_OF_WEEK=mon
LOCAL_WEEKLY_PLAN_HOUR=4
LOCAL_WEEKLY_PLAN_MINUTE=0
LOCAL_WEEKLY_PLAN_TIME_ZONE=Asia/Tokyo
LOCAL_WEEKLY_PLAN_USER_ID=default
LOCAL_WEEKLY_PLAN_RUN_MISSED_ON_STARTUP=true
LOCAL_WEEKLY_PLAN_FORCE=false
```

The scheduler is a regular Compose service, so plain `docker compose up` starts it with the local stack and plain `docker compose down` stops and removes it.

`LOCAL_WEEKLY_PLAN_DAY_OF_WEEK` accepts `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, or `sun`. Set `LOCAL_WEEKLY_PLAN_USER_ID` to the logged-in Strava athlete id when you want the generated plan to appear in the local web UI. It waits for the local agent to become healthy, catches up the current week after the configured weekday/time if that exact scheduled run has not already completed, and stores its local state in the Compose volume `local-weekly-scheduler-state`. The generated weekly plan still uses Monday as `week_start` for the target week.

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

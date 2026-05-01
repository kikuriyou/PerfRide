import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { readUserSettings, writeCoachDecision, writeUserSettings } from '@/lib/gcs-settings';
import type { CoachDecisionRecord, ProposedSession } from '@/lib/gcs-schema';
import type { GCSUserSettings } from '@/lib/gcs-settings';
import { readActivityCache } from '@/app/dashboard/_lib/gcs';
import { recomputeFitnessFromProcessed } from '@/app/dashboard/_lib/gcs';
import type { ProcessedActivity, FitnessComputation } from '@/app/dashboard/_lib/gcs';

interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;
  subscription_id: number;
  event_time: number;
}

interface StravaActivityResponse {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_speed: number;
  average_watts?: number;
  weighted_average_watts?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  suffer_score?: number;
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface AgentWebhookResponse {
  session_id?: string;
  trace_id?: string;
  summary?: string | null;
  detail?: string | null;
  why_now?: string | null;
  proposed_session?: ProposedSession | null;
  response?: string;
}

function buildTraceId(event: StravaWebhookEvent): string {
  return `strava-${event.object_id}-${event.event_time}`;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ 'hub.challenge': challenge });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const event = (await request.json()) as StravaWebhookEvent;
  const traceId = buildTraceId(event);
  const prefix = `[webhook trace_id=${traceId}]`;

  console.log(
    `${prefix} Received event: object_type=${event.object_type} aspect_type=${event.aspect_type} object_id=${event.object_id} owner_id=${event.owner_id}`,
  );

  if (event.object_type === 'activity' && event.aspect_type === 'create') {
    console.log(`${prefix} Scheduling background processing`);
    after(async () => {
      try {
        await processWebhookEvent(event, traceId);
      } catch (err) {
        console.error(`${prefix} processWebhookEvent failed:`, err);
      }
    });
  } else {
    console.log(`${prefix} Ignored event`);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

async function refreshStravaTokens(settings: GCSUserSettings): Promise<GCSUserSettings> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: settings.strava_auth.refresh_token,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${res.statusText}`);
  }

  const tokens: StravaTokenResponse = await res.json();
  const updated: GCSUserSettings = {
    ...settings,
    strava_auth: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
    },
    updated_at: new Date().toISOString(),
  };
  await writeUserSettings(updated);
  return updated;
}

async function getValidAccessToken(
  settings: GCSUserSettings,
): Promise<{ token: string; settings: GCSUserSettings }> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (settings.strava_auth.expires_at < nowSec + 60) {
    const refreshed = await refreshStravaTokens(settings);
    return { token: refreshed.strava_auth.access_token, settings: refreshed };
  }
  return { token: settings.strava_auth.access_token, settings };
}

function processActivity(raw: StravaActivityResponse, ftp: number): ProcessedActivity {
  const userFTP = ftp || 200;
  const hours = raw.moving_time / 3600;

  let tss: number;
  if (raw.average_watts) {
    const intensityFactor = raw.average_watts / userFTP;
    tss = hours * intensityFactor * intensityFactor * 100;
  } else {
    const distKm = raw.distance / 1000;
    const elevationFactor = 1 + raw.total_elevation_gain / distKm / 50;
    tss = Math.min(hours * 50 * elevationFactor, 300);
  }

  const npWatts = raw.weighted_average_watts || raw.average_watts;
  const intensityFactor = npWatts ? Math.round((npWatts / userFTP) * 100) / 100 : null;

  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    sport_type: raw.sport_type,
    start_date_local: raw.start_date_local,
    distance_km: Math.round((raw.distance / 1000) * 10) / 10,
    moving_time_hours: Math.round(hours * 100) / 100,
    total_elevation_gain_m: Math.round(raw.total_elevation_gain),
    average_speed_kmh: Math.round(raw.average_speed * 3.6 * 10) / 10,
    average_watts: raw.average_watts || null,
    weighted_average_watts: raw.weighted_average_watts || null,
    average_heartrate: raw.average_heartrate || null,
    max_heartrate: raw.max_heartrate || null,
    suffer_score: raw.suffer_score || null,
    tss_estimated: Math.round(tss),
    intensity_factor: intensityFactor,
  };
}

async function writeActivityCacheData(data: FitnessComputation): Promise<void> {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  const bucket = storage.bucket(process.env.GCS_BUCKET!);
  const blob = bucket.file('activity_cache.json');
  await blob.save(JSON.stringify(data, null, 2), {
    contentType: 'application/json',
  });
}

async function processWebhookEvent(event: StravaWebhookEvent, traceId: string): Promise<void> {
  const prefix = `[webhook trace_id=${traceId}]`;
  console.log(`${prefix} Background processing started`);

  const settings = await readUserSettings();
  if (!settings) {
    console.error(`${prefix} No user settings found in GCS`);
    return;
  }

  if (settings.strava_owner_id !== event.owner_id) {
    console.error(
      `${prefix} Owner mismatch: expected ${settings.strava_owner_id}, got ${event.owner_id}`,
    );
    return;
  }

  const { token } = await getValidAccessToken(settings);
  console.log(`${prefix} Access token ready`);

  const activityRes = await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!activityRes.ok) {
    console.error(`${prefix} Failed to fetch activity ${event.object_id}: ${activityRes.status}`);
    return;
  }

  const rawActivity: StravaActivityResponse = await activityRes.json();
  console.log(
    `${prefix} Fetched activity: id=${rawActivity.id} type=${rawActivity.type} sport_type=${rawActivity.sport_type} distance=${rawActivity.distance} moving_time=${rawActivity.moving_time}`,
  );

  if (!rawActivity.distance || !rawActivity.moving_time) {
    console.log(`${prefix} Skipping activity ${rawActivity.id}: missing distance or moving_time`);
    return;
  }

  if (rawActivity.type !== 'Ride' && rawActivity.type !== 'VirtualRide') {
    console.log(`${prefix} Skipping non-ride activity ${rawActivity.id}: type=${rawActivity.type}`);
    return;
  }

  const ftp = settings.ftp || 200;
  const processed = processActivity(rawActivity, ftp);

  const existingCache = await readActivityCache();
  const activities: ProcessedActivity[] = existingCache?.activities ?? [];

  if (activities.some((a) => a.id === processed.id)) {
    console.log(`${prefix} Activity ${processed.id} already in cache, skipping`);
    return;
  }

  activities.push(processed);
  activities.sort(
    (a, b) => new Date(a.start_date_local).getTime() - new Date(b.start_date_local).getTime(),
  );

  const updated = recomputeFitnessFromProcessed(activities, new Date());
  await writeActivityCacheData(updated);

  console.log(
    `${prefix} Activity cached: id=${processed.id} total_cached=${activities.length} ctl=${updated.fitness_metrics.ctl} atl=${updated.fitness_metrics.atl} tsb=${updated.fitness_metrics.tsb}`,
  );

  const agentUrl = process.env.AGENT_API_URL || 'http://localhost:8000';
  const endpoint = `${agentUrl}/api/agent/recommend`;
  console.log(`${prefix} Triggering agent at ${endpoint}`);

  try {
    const agentRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: 'webhook',
        activity_id: event.object_id,
        trace_id: traceId,
      }),
    });
    const body = await agentRes.text();

    if (!agentRes.ok) {
      console.error(`${prefix} Agent responded ${agentRes.status}: ${body}`);
      return;
    }

    let sessionId = 'unknown';
    let responseTraceId = 'unknown';
    try {
      const parsed = JSON.parse(body) as AgentWebhookResponse;
      sessionId = parsed.session_id ?? sessionId;
      responseTraceId = parsed.trace_id ?? responseTraceId;
      await writeCoachDecision(buildWebhookDecision(parsed, processed, traceId));
    } catch {
      // Keep raw body out of logs unless status is non-OK.
    }
    console.log(
      `${prefix} Agent responded: status=${agentRes.status} session_id=${sessionId} response_trace_id=${responseTraceId}`,
    );
  } catch (err) {
    console.error(`${prefix} Agent notify failed:`, err);
  }
}

export function buildWebhookDecision(
  agent: AgentWebhookResponse,
  activity: ProcessedActivity,
  traceId: string,
): CoachDecisionRecord {
  const proposed = agent.proposed_session ?? null;
  return {
    source: 'webhook',
    source_label: 'アクティビティ後の提案',
    summary: agent.summary || '次のおすすめが届きました',
    detail: agent.detail || agent.response || null,
    why_now: agent.why_now || proposed?.reason || null,
    proposed_session: proposed,
    activity_id: activity.id,
    session_id: agent.session_id ?? null,
    trace_id: agent.trace_id ?? traceId,
    created_at: new Date().toISOString(),
    valid_for_date: activity.start_date_local.slice(0, 10),
  };
}

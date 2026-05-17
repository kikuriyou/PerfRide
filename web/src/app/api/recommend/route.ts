import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { readActivityCache, recomputeFitnessFromProcessed } from '@/app/dashboard/_lib/gcs';
import { agentFetch } from '@/lib/agent';
import { authOptions } from '@/lib/auth';
import { parseJstClock } from '@/lib/jst-clock';
import {
  readCoachDecision,
  readTrainingPlan,
  readUserSettings,
  readWeeklyPlanReview,
} from '@/lib/gcs-settings';
import type { CoachDecisionRecord } from '@/lib/gcs-schema';
import type { UserLocale } from '@/lib/gcs-schema';
import { getCurrentPlanContext, isoDate } from '@/lib/weekly-plan';

interface RecommendBody {
  goal?: string;
  ftp?: number;
  goalCustom?: string | null;
  recommendMode?: string | null;
  usePersonalData?: boolean | null;
  coachAutonomy?: 'observe' | 'suggest' | 'coach' | null;
  locale?: UserLocale | null;
  timezone?: string | null;
  constraint?: string | null;
  mode?: string;
  asOf?: string | null;
}

interface ActivityOverride {
  activities: unknown[];
  fitness_metrics: { ctl: number; atl: number; tsb: number; weekly_tss: number };
  last_updated: string;
  schema: unknown | null;
}

async function buildActivityOverride(userId: string, asOf: Date): Promise<ActivityOverride | null> {
  const cache = await readActivityCache(userId);
  if (!cache) return null;
  const recomputed = recomputeFitnessFromProcessed(cache.activities, asOf);
  return {
    activities: recomputed.activities,
    fitness_metrics: recomputed.fitness_metrics,
    last_updated: recomputed.last_updated,
    schema: null,
  };
}

function currentJstReference(): Date {
  return new Date();
}

export function latestTodayActivity(
  cache: { activities: unknown[] } | null,
  today: string,
): { id?: number; start_date_local: string } | null {
  const activities = (cache?.activities ?? []) as { id?: number; start_date_local?: string }[];
  const todayActivities = activities
    .filter(
      (activity): activity is { id?: number; start_date_local: string } =>
        typeof activity.start_date_local === 'string',
    )
    .filter((activity) => activity.start_date_local.startsWith(today))
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
  return todayActivities.at(-1) ?? null;
}

export function validWebhookDecision(
  decision: CoachDecisionRecord | null,
  today: string,
  latestActivity: { id?: number } | null,
): CoachDecisionRecord | null {
  if (!decision || decision.source !== 'webhook') return null;
  if (decision.valid_for_date !== today) return null;
  if (!latestActivity) return null;
  if (typeof decision.activity_id === 'number' && latestActivity.id !== decision.activity_id) {
    return null;
  }
  return decision;
}

export function decisionResponse(
  decision: CoachDecisionRecord,
  locale: UserLocale = 'ja',
): Record<string, unknown> {
  return {
    summary: decision.summary,
    detail: decision.detail ?? decision.summary,
    created_at: decision.created_at,
    from_cache: false,
    why_now: decision.why_now ?? null,
    based_on:
      locale === 'en'
        ? 'Coach decision after completed activity'
        : 'アクティビティ完了後のコーチ判断',
    plan_context_key: decision.plan_context_key ?? null,
    proposed_session: decision.proposed_session ?? null,
    activity_id: decision.activity_id ?? null,
    trace_id: decision.trace_id ?? null,
    session_id: decision.session_id ?? null,
    source: decision.source,
  };
}

function normalizeLocale(value: unknown, fallback: UserLocale = 'ja'): UserLocale {
  return value === 'en' || value === 'ja' ? value : fallback;
}

function normalizeTimezone(value: unknown, fallback = 'Asia/Tokyo'): string {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallback;
  }
}

export function priorityDecisionResponse(
  decision: CoachDecisionRecord | null,
  today: string,
  latestActivity: { id?: number } | null,
  locale: UserLocale = 'ja',
): Record<string, unknown> | null {
  const webhookDecision = validWebhookDecision(decision, today, latestActivity);
  return webhookDecision ? decisionResponse(webhookDecision, locale) : null;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body: RecommendBody = await request.json();

    let asOfParsed: Date | null = null;
    let activityOverride: ActivityOverride | null = null;
    if (body.asOf) {
      const parsed = parseJstClock(body.asOf);
      if (parsed) {
        asOfParsed = parsed;
        activityOverride = await buildActivityOverride(userId, parsed);
      }
    }

    const userSettings = await readUserSettings(userId, { fallbackLegacy: true });
    const coachAutonomy = body.coachAutonomy ?? userSettings?.coach_autonomy ?? 'suggest';
    const locale = normalizeLocale(body.locale ?? userSettings?.locale);
    const timezone = normalizeTimezone(body.timezone ?? userSettings?.timezone);
    const [trainingPlan, reviewStore, coachDecision, rawActivityCache] = await Promise.all([
      readTrainingPlan(userId),
      readWeeklyPlanReview(userId),
      readCoachDecision(userId),
      readActivityCache(userId),
    ]);
    const planContext = getCurrentPlanContext(
      coachAutonomy,
      trainingPlan,
      reviewStore,
      asOfParsed ?? currentJstReference(),
    );

    const reference = asOfParsed ?? currentJstReference();
    const today = isoDate(reference);
    const activityCache = activityOverride ?? rawActivityCache;
    const latestActivity = latestTodayActivity(activityCache, today);
    const shouldUsePriority =
      !body.constraint && !body.asOf && body.mode !== 'insight' && coachAutonomy === 'coach';
    if (shouldUsePriority) {
      const priorityResponse = priorityDecisionResponse(
        coachDecision,
        today,
        latestActivity,
        locale,
      );
      if (priorityResponse) {
        return NextResponse.json(priorityResponse);
      }
    }

    const response = await agentFetch('/recommend', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        goal: body.goal || 'fitness_maintenance',
        ftp: body.ftp || 200,
        goal_custom: body.goalCustom || null,
        recommend_mode: body.recommendMode || null,
        use_personal_data: body.usePersonalData ?? null,
        coach_autonomy: coachAutonomy,
        locale,
        timezone,
        plan_context_key: planContext.planContextKey,
        constraint: body.constraint || null,
        mode: body.mode || 'recommend',
        as_of: asOfParsed ? asOfParsed.toISOString() : null,
        activity_override: activityOverride,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Agent API error: ${error}` }, { status: response.status });
    }

    const data = (await response.json()) as Record<string, unknown>;
    const payload = { ...data };
    delete payload.source_label;
    return NextResponse.json({
      ...payload,
      coach_autonomy: coachAutonomy,
      plan_context_key: data.plan_context_key ?? planContext.planContextKey,
      source: data.source ?? 'generated',
    });
  } catch (error) {
    console.error('Recommend API error:', error);
    return NextResponse.json(
      { error: 'Failed to get recommendation. Make sure the agent service is running.' },
      { status: 500 },
    );
  }
}

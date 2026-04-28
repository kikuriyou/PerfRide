import { NextResponse } from 'next/server';

import {
  parseJstClock,
  readActivityCache,
  recomputeFitnessFromProcessed,
} from '@/app/dashboard/_lib/gcs';
import {
  readCoachDecision,
  readTrainingPlan,
  readUserSettings,
  readWeeklyPlanReview,
} from '@/lib/gcs-settings';
import type { ApprovedWeekPayload, CoachDecisionRecord, ProposedSession } from '@/lib/gcs-schema';
import { getCurrentPlanContext, isoDate, mondayOfWeek } from '@/lib/weekly-plan';
import { formatSessionBrief } from '@/lib/training-session-display';

interface RecommendBody {
  goal?: string;
  ftp?: number;
  goalCustom?: string | null;
  recommendMode?: string | null;
  usePersonalData?: boolean | null;
  coachAutonomy?: 'observe' | 'suggest' | 'coach' | null;
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

async function buildActivityOverride(asOf: Date): Promise<ActivityOverride | null> {
  const cache = await readActivityCache();
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
    .filter((activity) =>
      activity.start_date_local.startsWith(today),
    )
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

function proposedFromSession(session: {
  date: string;
  type: string;
  duration_minutes?: number;
  target_tss?: number;
  notes?: string;
}): ProposedSession {
  return {
    session_date: session.date,
    session_type: session.type,
    duration_minutes: session.duration_minutes ?? 0,
    target_tss: session.target_tss ?? 0,
    notes: session.notes ?? null,
    is_rest: session.type === 'rest',
    source: 'weekly_plan',
  };
}

export function weeklyPlanRecommendation(
  week: ApprovedWeekPayload | null,
  today: string,
): Record<string, unknown> | null {
  if (!week) return null;
  const todayIndex = week.sessions.findIndex((session) => session.date === today);
  const candidates = week.sessions.filter((session) => session.date >= today);
  const session =
    candidates.find((candidate) => candidate.type !== 'rest') ??
    (todayIndex >= 0 ? week.sessions[todayIndex] : null);
  if (!session) return null;
  const summary =
    session.type === 'rest'
      ? '今日は週次プラン上は休養日です。回復を優先しましょう。'
      : `週次プランでは次に ${formatSessionBrief(session)} が予定されています。`;
  return {
    summary,
    detail: week.summary ?? summary,
    created_at: week.updated_at,
    from_cache: false,
    why_now: '月曜の週次プランをもとに表示しています。',
    based_on: `Weekly plan ${week.week_start} revision ${week.plan_revision}`,
    plan_context_key: `coach:${week.week_start}:${week.plan_revision}:${week.status}`,
    proposed_session: proposedFromSession(session),
    source: 'weekly_plan',
    source_label: '今週のプラン',
  };
}

export function decisionResponse(decision: CoachDecisionRecord): Record<string, unknown> {
  return {
    summary: decision.summary,
    detail: decision.detail ?? decision.summary,
    created_at: decision.created_at,
    from_cache: false,
    why_now: decision.why_now ?? null,
    based_on: 'アクティビティ完了後のコーチ判断',
    plan_context_key: decision.plan_context_key ?? null,
    proposed_session: decision.proposed_session ?? null,
    source: decision.source,
    source_label: decision.source_label,
  };
}

export async function POST(request: Request) {
  try {
    const body: RecommendBody = await request.json();

    const agentUrl = process.env.AGENT_API_URL || 'http://localhost:8000';

    let asOfParsed: Date | null = null;
    let activityOverride: ActivityOverride | null = null;
    if (body.asOf) {
      const parsed = parseJstClock(body.asOf);
      if (parsed) {
        asOfParsed = parsed;
        activityOverride = await buildActivityOverride(parsed);
      }
    }

    const userSettings = await readUserSettings();
    const coachAutonomy = body.coachAutonomy ?? userSettings?.coach_autonomy ?? 'suggest';
    const [trainingPlan, reviewStore, coachDecision, rawActivityCache] = await Promise.all([
      readTrainingPlan(),
      readWeeklyPlanReview(),
      readCoachDecision(),
      readActivityCache(),
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
      const webhookDecision = validWebhookDecision(coachDecision, today, latestActivity);
      if (webhookDecision) {
        return NextResponse.json(decisionResponse(webhookDecision));
      }
      const jstWeekStart = mondayOfWeek(reference);
      const isMonday = today === jstWeekStart;
      if (isMonday && !latestActivity) {
        const weekly = weeklyPlanRecommendation(planContext.week, today);
        if (weekly) {
          return NextResponse.json(weekly);
        }
      }
    }

    const response = await fetch(`${agentUrl}/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goal: body.goal || 'fitness_maintenance',
        ftp: body.ftp || 200,
        goal_custom: body.goalCustom || null,
        recommend_mode: body.recommendMode || null,
        use_personal_data: body.usePersonalData ?? null,
        coach_autonomy: coachAutonomy,
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
    return NextResponse.json({
      ...data,
      coach_autonomy: coachAutonomy,
      plan_context_key: data.plan_context_key ?? planContext.planContextKey,
      source: data.source ?? 'generated',
      source_label: data.source_label ?? '今の状態から作成',
    });
  } catch (error) {
    console.error('Recommend API error:', error);
    return NextResponse.json(
      { error: 'Failed to get recommendation. Make sure the agent service is running.' },
      { status: 500 },
    );
  }
}

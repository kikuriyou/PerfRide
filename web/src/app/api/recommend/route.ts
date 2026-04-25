import { NextResponse } from 'next/server';

import {
  parseJstClock,
  readActivityCache,
  recomputeFitnessFromProcessed,
} from '@/app/dashboard/_lib/gcs';
import { readTrainingPlan, readUserSettings, readWeeklyPlanReview } from '@/lib/gcs-settings';
import { getCurrentPlanContext } from '@/lib/weekly-plan';

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
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
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
    const [trainingPlan, reviewStore] = await Promise.all([
      readTrainingPlan(),
      readWeeklyPlanReview(),
    ]);
    const planContext = getCurrentPlanContext(
      coachAutonomy,
      trainingPlan,
      reviewStore,
      asOfParsed ?? currentJstReference(),
    );

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
    });
  } catch (error) {
    console.error('Recommend API error:', error);
    return NextResponse.json(
      { error: 'Failed to get recommendation. Make sure the agent service is running.' },
      { status: 500 },
    );
  }
}

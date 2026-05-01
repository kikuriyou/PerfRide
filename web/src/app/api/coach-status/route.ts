import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { readActivityCache } from '@/app/dashboard/_lib/gcs';
import { authOptions } from '@/lib/auth';
import { readCoachDecision, readTrainingPlan, readUserSettings } from '@/lib/gcs-settings';
import { approvedWeekForDate, isoDate } from '@/lib/weekly-plan';
import { latestTodayActivity, validWebhookDecision } from '@/app/api/recommend/route';
import { buildCoachStatusCandidates } from '@/app/dashboard/_components/coach-status-banner-helpers';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [settings, trainingPlan, coachDecision, activityCache] = await Promise.all([
      readUserSettings(),
      readTrainingPlan(),
      readCoachDecision(),
      readActivityCache(),
    ]);
    const coachAutonomy = settings?.coach_autonomy ?? 'suggest';
    if (coachAutonomy !== 'coach') {
      return NextResponse.json({ items: [], coach_autonomy: coachAutonomy });
    }

    const today = isoDate(new Date());
    const latestActivity = latestTodayActivity(activityCache, today);
    const webhookDecision = validWebhookDecision(coachDecision, today, latestActivity);
    const currentWeek = approvedWeekForDate(trainingPlan, today);
    const items = buildCoachStatusCandidates({
      webhookDecision,
      currentWeek: currentWeek
        ? {
            week_start: currentWeek.week_start,
            plan_revision: currentWeek.plan_revision,
          }
        : null,
    });

    return NextResponse.json({ items, coach_autonomy: coachAutonomy });
  } catch (error) {
    console.error('Coach status API error:', error);
    return NextResponse.json({ items: [], coach_autonomy: 'suggest' });
  }
}

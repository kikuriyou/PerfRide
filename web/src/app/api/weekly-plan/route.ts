import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { readTrainingPlan, readUserSettings, readWeeklyPlanReview } from '@/lib/gcs-settings';
import { mondayOfWeek, isoDate } from '@/lib/weekly-plan';
import type { ApprovedWeekPayload, WeeklyPlanReviewPayload } from '@/lib/gcs-schema';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [settings, plan, reviewStore] = await Promise.all([
      readUserSettings(),
      readTrainingPlan(),
      readWeeklyPlanReview(),
    ]);

    const coachAutonomy = settings?.coach_autonomy ?? 'suggest';
    const now = new Date();
    const today = isoDate(now);
    const weekStart = mondayOfWeek(now);

    const currentWeek: ApprovedWeekPayload | null = plan
      ? (Object.values(plan.weekly_plan).find((w) => w.week_start === weekStart) ?? null)
      : null;

    const pendingReviewRaw = reviewStore.reviews[`weekly_${weekStart}`];
    const pendingReview: WeeklyPlanReviewPayload | null =
      pendingReviewRaw && (pendingReviewRaw.status === 'pending' || pendingReviewRaw.status === 'modified')
        ? pendingReviewRaw
        : null;

    const todaySessions = currentWeek?.sessions.filter((s) => s.date === today) ?? [];
    const todaySessionsPayload = todaySessions.map((s) => ({
      date: today,
      type: s.type,
      status: s.status,
      duration_minutes: s.duration_minutes,
      target_tss: s.target_tss,
      origin: s.origin ?? 'baseline',
    }));
    // Keep `today_session` (singular) until WeeklyPlanCard switches to today_sessions in Phase 6.
    const todaySession = todaySessionsPayload[0] ?? null;

    return NextResponse.json({
      coach_autonomy: coachAutonomy,
      current_week: currentWeek
        ? {
            week_start: currentWeek.week_start,
            phase: currentWeek.phase,
            target_tss: currentWeek.target_tss,
            plan_revision: currentWeek.plan_revision,
            status: currentWeek.status,
            sessions: currentWeek.sessions,
          }
        : null,
      pending_review: pendingReview
        ? {
            review_id: pendingReview.review_id,
            week_start: pendingReview.week_start,
            plan_revision: pendingReview.plan_revision,
            status: pendingReview.status,
            draft: pendingReview.draft,
          }
        : null,
      today_session: todaySession,
      today_sessions: todaySessionsPayload,
    });
  } catch (err) {
    console.error('[GET /api/weekly-plan] error:', err);
    return NextResponse.json({
      coach_autonomy: 'suggest',
      current_week: null,
      pending_review: null,
      today_session: null,
      today_sessions: [],
    });
  }
}

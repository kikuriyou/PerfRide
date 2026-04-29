import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { readTrainingPlan, readUserSettings, readWeeklyPlanReview } from '@/lib/gcs-settings';
import { approvedWeekForDate, mondayOfWeek, isoDate } from '@/lib/weekly-plan';
import { decodeAsOfCookie, resolveWeeklyPlanReference } from '@/lib/weekly-plan-reference';
import type { ApprovedWeekPayload, WeeklyPlanReviewPayload } from '@/lib/gcs-schema';

async function referenceDateFromRequest(request: Request): Promise<{
  reference: Date;
  asOf: string | null;
}> {
  const url = new URL(request.url);
  const queryAsOf = url.searchParams.get('asOf');
  const cookieStore = await cookies();
  const cookieAsOf = decodeAsOfCookie(cookieStore.get('perfride_as_of')?.value);
  return resolveWeeklyPlanReference(queryAsOf || cookieAsOf);
}

export async function GET(request: Request) {
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
    const { reference, asOf } = await referenceDateFromRequest(request);
    const today = isoDate(reference);
    const weekStart = mondayOfWeek(reference);

    const currentWeek: ApprovedWeekPayload | null = approvedWeekForDate(plan, today);

    const pendingReviewRaw = reviewStore.reviews[`weekly_${weekStart}`];
    const pendingReview: WeeklyPlanReviewPayload | null =
      pendingReviewRaw &&
      (pendingReviewRaw.status === 'pending' || pendingReviewRaw.status === 'modified')
        ? pendingReviewRaw
        : null;
    const displayWeek = currentWeek ?? pendingReview?.draft ?? null;

    const todaySessionsPayload =
      displayWeek?.sessions
        .filter((s) => s.date === today)
        .map((s) => ({
          session_id: s.session_id,
          date: today,
          type: s.type,
          status: s.status,
          duration_minutes: s.duration_minutes,
          target_tss: s.target_tss,
          origin: s.origin ?? 'baseline',
        })) ?? [];

    return NextResponse.json({
      coach_autonomy: coachAutonomy,
      reference_date: today,
      week_start: weekStart,
      as_of: asOf,
      current_week: currentWeek
        ? {
            week_start: currentWeek.week_start,
            phase: currentWeek.phase,
            target_tss: currentWeek.target_tss,
            plan_revision: currentWeek.plan_revision,
            status: currentWeek.status,
            updated_at: currentWeek.updated_at,
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
      today_sessions: todaySessionsPayload,
    });
  } catch (err) {
    console.error('[GET /api/weekly-plan] error:', err);
    return NextResponse.json({
      coach_autonomy: 'suggest',
      reference_date: isoDate(new Date()),
      week_start: mondayOfWeek(new Date()),
      as_of: null,
      current_week: null,
      pending_review: null,
      today_sessions: [],
    });
  }
}

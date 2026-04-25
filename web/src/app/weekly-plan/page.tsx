import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { readTrainingPlan, readUserSettings, readWeeklyPlanReview } from '@/lib/gcs-settings';
import { mondayOfWeek, isoDate } from '@/lib/weekly-plan';
import type { ApprovedWeekPayload, WeeklyPlanReviewPayload } from '@/lib/gcs-schema';
import { WeekView } from './_components/WeekView';

export const dynamic = 'force-dynamic';

interface PendingReviewSummary {
  review_id: string;
  week_start: string;
  plan_revision: number;
  status: string;
}

export default async function WeeklyPlanPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/api/auth/signin');
  }

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

  const displayWeek: ApprovedWeekPayload | null = currentWeek ?? pendingReview?.draft ?? null;
  const pendingSummary: PendingReviewSummary | null = pendingReview
    ? {
        review_id: pendingReview.review_id,
        week_start: pendingReview.week_start,
        plan_revision: pendingReview.plan_revision,
        status: pendingReview.status,
      }
    : null;

  return (
    <main style={{ padding: '1.5rem 1rem', maxWidth: '1100px', margin: '0 auto' }}>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>📅 Weekly Plan</h1>
        <p style={{ margin: '0.3rem 0 0', opacity: 0.7, fontSize: '0.85rem' }}>
          Week of {weekStart} · today {today}
        </p>
      </header>

      {coachAutonomy !== 'coach' && (
        <div
          style={{
            padding: '0.85rem 1rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            fontSize: '0.85rem',
          }}
        >
          Coach mode is off. Switch to coach autonomy in <a href="/settings">Settings</a> to receive a weekly plan.
        </div>
      )}

      {coachAutonomy === 'coach' && pendingSummary && (
        <div
          data-testid="pending-review-banner"
          style={{
            padding: '0.7rem 1rem',
            background: 'rgba(255,152,0,0.1)',
            border: '1px solid rgba(255,152,0,0.4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            fontSize: '0.85rem',
          }}
        >
          🔔 Pending review for {pendingSummary.week_start} (revision {pendingSummary.plan_revision},{' '}
          status: {pendingSummary.status}). Approve / modify actions are coming next phase.
        </div>
      )}

      {coachAutonomy === 'coach' && !displayWeek && (
        <div
          style={{
            padding: '1rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            fontSize: '0.85rem',
          }}
        >
          No weekly plan for this week yet. The Monday scheduler will generate one.
        </div>
      )}

      {coachAutonomy === 'coach' && displayWeek && (
        <section>
          <div
            style={{
              display: 'flex',
              gap: '0.6rem',
              alignItems: 'center',
              marginBottom: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                background: '#009688',
                color: 'white',
                padding: '0.18rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.72rem',
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {displayWeek.phase}
            </span>
            <span style={{ fontSize: '0.78rem', opacity: 0.75 }}>
              Target TSS {displayWeek.target_tss} · revision {displayWeek.plan_revision} ·{' '}
              status {displayWeek.status}
            </span>
          </div>
          <WeekView week={displayWeek} today={today} />
        </section>
      )}
    </main>
  );
}

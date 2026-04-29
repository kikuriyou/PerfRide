import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { readTrainingPlan, readUserSettings } from '@/lib/gcs-settings';
import { approvedWeekForDate, mondayOfWeek, isoDate } from '@/lib/weekly-plan';
import {
  decodeAsOfCookie,
  formatJstClockLabel,
  resolveWeeklyPlanReference,
} from '@/lib/weekly-plan-reference';
import type { ApprovedWeekPayload } from '@/lib/gcs-schema';
import { AddSessionForm } from './_components/AddSessionForm';
import { WeekView } from './_components/WeekView';

export const dynamic = 'force-dynamic';

interface WeeklyPlanPageProps {
  searchParams?: Promise<{ asOf?: string }> | { asOf?: string };
}

function statusLabel(status: string): string {
  if (status === 'approved') return '現在のプラン';
  if (status === 'draft') return '下書き';
  return status;
}

export default async function WeeklyPlanPage({ searchParams }: WeeklyPlanPageProps) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/api/auth/signin');
  }

  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const cookieStore = await cookies();
  const asOf =
    resolvedSearchParams.asOf || decodeAsOfCookie(cookieStore.get('perfride_as_of')?.value);
  const referenceState = resolveWeeklyPlanReference(asOf);
  const reference = referenceState.reference;

  const [settings, plan] = await Promise.all([readUserSettings(), readTrainingPlan()]);

  const coachAutonomy = settings?.coach_autonomy ?? 'suggest';
  const today = isoDate(reference);
  const weekStart = mondayOfWeek(reference);

  const currentWeek: ApprovedWeekPayload | null = approvedWeekForDate(plan, today);
  const displayWeek: ApprovedWeekPayload | null = currentWeek;

  return (
    <main style={{ padding: '1.5rem 1rem', maxWidth: '1100px', margin: '0 auto' }}>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>📅 Weekly Plan</h1>
        <p style={{ margin: '0.3rem 0 0', opacity: 0.7, fontSize: '0.85rem' }}>
          Week of {weekStart} ·{' '}
          {referenceState.asOf
            ? `確認日時 ${formatJstClockLabel(referenceState.asOf)} JST`
            : `today ${today}`}
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
          Coach mode is off. Switch to coach autonomy in <a href="/settings">Settings</a> to receive
          a weekly plan.
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
              {statusLabel(displayWeek.status)}
            </span>
          </div>
          <div
            style={{
              marginBottom: '0.75rem',
              padding: '0.45rem 0.65rem',
              border: '1px solid rgba(0,150,136,0.25)',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(0,150,136,0.06)',
              fontSize: '0.78rem',
              color: '#00796b',
            }}
          >
            Weekly Plan updated · revision {displayWeek.plan_revision} · {displayWeek.updated_at}
          </div>
          <WeekView week={displayWeek} today={today} />
          <AddSessionForm
            weekStart={displayWeek.week_start}
            today={today}
            planRevision={displayWeek.plan_revision}
          />
        </section>
      )}
    </main>
  );
}

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getCachedStarredSegments } from '@/lib/strava-cached';
import PaceOptimizerForm from './_components/PaceOptimizerForm';
import Link from 'next/link';
import ExperimentalBadge, { ExperimentalNotice } from '@/components/ExperimentalBadge';

export default async function OptimizerPage() {
  const session = await getServerSession(authOptions);

  // Fetch starred segments if logged in
  let segments: {
    id: number;
    name: string;
    distance: number;
    elevation_gain: number;
    average_grade: number;
  }[] = [];
  if (session?.accessToken && session.user?.id) {
    try {
      const starredSegments = await getCachedStarredSegments(session.user.id, session.accessToken);
      segments = starredSegments.map((s) => ({
        id: s.id,
        name: s.name,
        distance: s.distance,
        elevation_gain: s.elevation_high - s.elevation_low,
        average_grade: s.average_grade,
      }));
    } catch (e) {
      console.error('Failed to fetch segments:', e);
    }
  }

  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span>🎯 Pace Optimizer</span>
          <ExperimentalBadge />
        </h1>
        <p style={{ opacity: 0.7, marginTop: '0.25rem', fontSize: '0.9rem' }}>
          Calculate an optimal pacing strategy from the course profile.
        </p>
        <ExperimentalNotice>
          This tool is experimental. Pacing recommendations are estimates and should be validated
          against your condition, course, and race-day constraints.
        </ExperimentalNotice>
      </header>

      {/* Login prompt if not logged in */}
      {!session && (
        <div
          style={{
            background: 'var(--surface)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '0.9rem' }}>
            💡 Connect Strava to use your starred segments.
          </span>
          <Link
            href="/api/auth/signin"
            className="btn btn-primary"
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            Connect Strava
          </Link>
        </div>
      )}

      <section>
        <div className="card">
          <PaceOptimizerForm segments={segments} />
        </div>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <div
          style={{
            background: 'var(--surface)',
            padding: '1.5rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem' }}>
            📚 About This Tool
          </h2>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, opacity: 0.85 }}>
            This tool is based on the method from &quot;A numerical design methodology for optimal
            pacing strategy in the individual time trial discipline of cycling&quot; (Sports
            Engineering, 2025).
          </p>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, opacity: 0.85, marginTop: '0.75rem' }}>
            Under a <strong>Normalized Power (NP)</strong> constraint, it adjusts power by gradient
            and wind so the modeled finish time can beat a constant-power strategy. The paper
            reports a 0.45% to 2.84% time improvement.
          </p>
          <p style={{ fontSize: '0.85rem', marginTop: '1rem', opacity: 0.6 }}>
            ⚠️ This tool is for education and reference. Account for your condition and race-day
            constraints before using it in an event.
          </p>
        </div>
      </section>
    </div>
  );
}

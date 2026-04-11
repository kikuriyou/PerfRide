import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getCachedStarredSegments } from '@/lib/strava-cached';
import PaceOptimizerForm from './_components/PaceOptimizerForm';
import Link from 'next/link';

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
        <h1>🎯 Pace Optimizer</h1>
        <p style={{ opacity: 0.7, marginTop: '0.25rem', fontSize: '0.9rem' }}>
          コースプロファイルに基づいて最適なペース配分を計算します
        </p>
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
            💡 Stravaと連携すると、スターしたセグメントのデータを使用できます
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
            📚 このツールについて
          </h2>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, opacity: 0.85 }}>
            本ツールは論文 &quot;A numerical design methodology for optimal pacing strategy in the
            individual time trial discipline of cycling&quot; (Sports Engineering, 2025)
            の手法に基づいています。
          </p>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, opacity: 0.85, marginTop: '0.75rem' }}>
            <strong>Normalized Power (NP)</strong> 制約の下で、コースの勾配や風向きに応じた
            最適なパワー配分を計算することで、一定パワー戦略よりも短いタイムでゴールできます。
            論文では0.45%〜2.84%のタイム改善が報告されています。
          </p>
          <p style={{ fontSize: '0.85rem', marginTop: '1rem', opacity: 0.6 }}>
            ⚠️
            本ツールは教育・参考目的です。実際のレースでは体調やコンディションを考慮してください。
          </p>
        </div>
      </section>
    </div>
  );
}

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { StravaSegment } from '@/lib/strava';
import { getCachedStarredSegments } from '@/lib/strava-cached';
import SegmentCard from './_components/SegmentCard';
import SimulatorForm from './_components/SimulatorForm';
import SegmentSearchWrapper from './_components/SegmentSearchWrapper';
import Link from 'next/link';

export default async function SimulatorPage() {
  const session = await getServerSession(authOptions);

  let segments: StravaSegment[] = [];
  if (session?.accessToken && session.user?.id) {
    try {
      segments = await getCachedStarredSegments(session.user.id, session.accessToken);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1>Climb Simulator</h1>
        <p style={{ opacity: 0.7, marginTop: '0.25rem', fontSize: '0.9rem' }}>
          Predict your climbing time based on power and weight
        </p>
      </header>

      {/* Manual Input Mode - Always available */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Quick Simulate</h2>
        <div className="card">
          <SimulatorForm
            segmentName="Custom Segment"
            distance={5000}
            elevationGain={400}
            averageGrade={8}
          />
        </div>
      </section>

      {/* Strava Starred Segments - Only when logged in */}
      <section style={{ marginBottom: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2>⭐ Starred Segments</h2>
          {!session && (
            <Link
              href="/api/auth/signin"
              className="btn btn-primary"
              style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
            >
              Connect Strava
            </Link>
          )}
        </div>

        {session ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {segments.length > 0 ? (
              segments.map((segment) => (
                <SegmentCard
                  key={segment.id}
                  id={segment.id}
                  name={segment.name}
                  distance={segment.distance}
                  averageGrade={segment.average_grade}
                  elevationGain={segment.elevation_high - segment.elevation_low}
                />
              ))
            ) : (
              <div
                style={{
                  gridColumn: '1/-1',
                  textAlign: 'center',
                  padding: '2rem',
                  background: 'var(--surface)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <p>No starred segments found.</p>
                <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.5rem' }}>
                  Star segments on Strava to simulate them here.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ opacity: 0.7 }}>Connect with Strava to search and simulate segments</p>
          </div>
        )}
      </section>

      {/* Map-based Segment Search - Only when logged in */}
      {session && (
        <section>
          <h2 style={{ marginBottom: '1rem' }}>🗺️ セグメントを地図から探す</h2>
          <div className="card">
            <SegmentSearchWrapper />
          </div>
        </section>
      )}
    </div>
  );
}

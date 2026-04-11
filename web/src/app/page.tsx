import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import LoginButton from '@/components/LoginButton';

export default async function Home() {
  const session = await getServerSession(authOptions).catch(() => null);

  return (
    <main className="container" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            background: 'linear-gradient(to right, var(--primary), #ffa07a)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '1rem',
          }}
        >
          PerfRide
        </h1>
        <p style={{ fontSize: '1.1rem', opacity: 0.7, maxWidth: '500px', margin: '0 auto' }}>
          Your cycling performance toolkit — simulate climbs, plan training, track progress
        </p>
      </div>

      {/* Feature Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem',
          maxWidth: '900px',
          margin: '0 auto',
        }}
      >
        {/* Dashboard Card - First */}
        {session ? (
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <div
              className="card"
              style={{
                padding: '2rem',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'pointer',
                borderColor: 'var(--primary)',
                borderWidth: '2px',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
              <h2 style={{ marginBottom: '0.5rem' }}>Dashboard</h2>
              <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
                View your Strava activities, fitness progress, and training stats
              </p>
            </div>
          </Link>
        ) : (
          <div
            className="card"
            style={{
              padding: '2rem',
              opacity: 0.8,
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
            <h2 style={{ marginBottom: '0.5rem' }}>Dashboard</h2>
            <p style={{ opacity: 0.7, fontSize: '0.9rem', marginBottom: '1rem' }}>
              Connect with Strava to view your activities and fitness progress
            </p>
            <LoginButton />
          </div>
        )}

        {/* Simulator Card - Second */}
        <Link href="/simulator" style={{ textDecoration: 'none' }}>
          <div
            className="card"
            style={{
              padding: '2rem',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏔️</div>
            <h2 style={{ marginBottom: '0.5rem' }}>Climb Simulator</h2>
            <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
              Predict your climbing times based on power, weight, and segment data
            </p>
          </div>
        </Link>

        {/* Planner Card - Third */}
        <Link href="/planner" style={{ textDecoration: 'none' }}>
          <div
            className="card"
            style={{
              padding: '2rem',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📅</div>
            <h2 style={{ marginBottom: '0.5rem' }}>Training Planner</h2>
            <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
              Generate periodized training plans with structured workouts
            </p>
          </div>
        </Link>
      </div>

      {/* Settings Link */}
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link href="/settings" style={{ opacity: 0.7, fontSize: '0.9rem' }}>
          ⚙️ Configure your FTP, weight, and max HR in Settings
        </Link>
      </div>
    </main>
  );
}

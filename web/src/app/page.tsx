import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import LoginButton from '@/components/LoginButton';
import ExperimentalBadge from '@/components/ExperimentalBadge';

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

      {/* Core Feature Cards */}
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

        {session && (
          <Link href="/weekly-plan" style={{ textDecoration: 'none' }}>
            <div
              className="card"
              style={{
                padding: '2rem',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📅</div>
              <h2 style={{ marginBottom: '0.5rem' }}>Weekly Plan</h2>
              <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
                Review and adjust your coach-mode weekly training plan
              </p>
            </div>
          </Link>
        )}
      </div>

      {/* Experimental Tools */}
      <section style={{ maxWidth: '900px', margin: '2rem auto 0' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h2 style={{ marginBottom: '0.35rem' }}>Experimental Labs</h2>
            <p style={{ opacity: 0.7, fontSize: '0.9rem', margin: 0 }}>
              Preview tools. Outputs are estimates and may change.
            </p>
          </div>
          <ExperimentalBadge />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
          }}
        >
          <Link href="/simulator" style={{ textDecoration: 'none' }}>
            <div
              className="card"
              style={{
                padding: '1.5rem',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'pointer',
                minHeight: '180px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontSize: '2rem' }}>🏔️</div>
                <ExperimentalBadge />
              </div>
              <h3 style={{ marginBottom: '0.5rem' }}>Climb Simulator</h3>
              <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
                Predict climbing times based on power, weight, and segment data
              </p>
            </div>
          </Link>

          <Link href="/optimizer" style={{ textDecoration: 'none' }}>
            <div
              className="card"
              style={{
                padding: '1.5rem',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'pointer',
                minHeight: '180px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontSize: '2rem' }}>🎯</div>
                <ExperimentalBadge />
              </div>
              <h3 style={{ marginBottom: '0.5rem' }}>Pace Optimizer</h3>
              <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
                Estimate course-aware pacing strategies for climbs and time trials
              </p>
            </div>
          </Link>

          <Link href="/planner" style={{ textDecoration: 'none' }}>
            <div
              className="card"
              style={{
                padding: '1.5rem',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'pointer',
                minHeight: '180px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontSize: '2rem' }}>📅</div>
                <ExperimentalBadge />
              </div>
              <h3 style={{ marginBottom: '0.5rem' }}>Training Planner</h3>
              <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
                Generate periodized training plans with structured workouts
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* Settings Link */}
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link href="/settings" style={{ opacity: 0.7, fontSize: '0.9rem' }}>
          ⚙️ Configure your FTP, weight, and max HR in Settings
        </Link>
      </div>
    </main>
  );
}

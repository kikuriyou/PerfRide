import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { formatDistance, formatDuration, formatElevation, StravaActivity } from '@/lib/strava';
import { getSmartCachedActivities, getSmartCachedAthleteStats } from '@/lib/strava-cached';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import FitnessChartWrapper from './_components/FitnessChartWrapper';
import RideCard from './_components/RideCard';
import InsightCards from './_components/InsightCards';
import RecommendCard from './_components/RecommendCard';
import WeeklyPlanCard from './_components/WeeklyPlanCard';
import CoachStatusBanner from './_components/CoachStatusBanner';
import DevAsOfBanner from './_components/DevAsOfBanner';
import { writeActivityCache } from './_lib/gcs';

export default async function DashboardPage() {
  // eslint-disable-next-line react-hooks/purity -- server component debug logging
  const rid = Date.now().toString(36);
  const t = (label: string) => `[Dashboard:${rid}] ${label}`;

  console.time(t('Total SSR'));
  console.time(t('getServerSession'));
  const session = await getServerSession(authOptions);
  console.timeEnd(t('getServerSession'));

  if (!session || !session.accessToken || !session.user?.id) {
    redirect('/');
  }

  let activities: StravaActivity[] = [];
  let allActivities: StravaActivity[] = [];
  let stats = null;

  try {
    console.time(t('Strava cached data'));
    const { activities: cachedActivities, latestId } = await getSmartCachedActivities(
      session.user.id,
      session.accessToken,
    );
    const athleteStats = await getSmartCachedAthleteStats(
      session.user.id,
      session.accessToken,
      latestId,
    );
    console.timeEnd(t('Strava cached data'));
    activities = cachedActivities.slice(0, 30);
    allActivities = cachedActivities;
    stats = athleteStats;

    const cookieStore = await cookies();
    const ftpCookie = cookieStore.get('perfride_ftp');
    const userFtp = ftpCookie ? parseInt(ftpCookie.value, 10) || 200 : 200;

    try {
      await writeActivityCache(allActivities, userFtp);
    } catch (cacheErr) {
      console.error('Failed to write activity cache to GCS:', cacheErr);
    }
  } catch (e) {
    console.error(e);
  }
  console.timeEnd(t('Total SSR'));

  const rides = activities.filter((a) => a.type === 'Ride' || a.type === 'VirtualRide');

  const now = new Date();
  const weekStart = new Date(now);
  // 月曜始まり: 日曜(0)は6日前、それ以外は(dayOfWeek - 1)日前
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(now.getDate() - daysToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const thisWeekRides = rides.filter((a) => new Date(a.start_date_local) >= weekStart);
  const weekDistance = thisWeekRides.reduce((sum, a) => sum + a.distance, 0);
  const weekElevation = thisWeekRides.reduce((sum, a) => sum + a.total_elevation_gain, 0);
  const weekTime = thisWeekRides.reduce((sum, a) => sum + a.moving_time, 0);

  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1>Dashboard</h1>
        <p style={{ opacity: 0.7, marginTop: '0.25rem', fontSize: '0.9rem' }}>
          Your recent activities and training summary
        </p>
      </header>

      <DevAsOfBanner />
      <CoachStatusBanner />

      {/* Insight Cards */}
      <InsightCards />

      {/* Today's Recommendation */}
      <section style={{ marginBottom: '1.5rem' }}>
        <RecommendCard />
      </section>

      {/* Weekly Plan Card */}
      <section style={{ marginBottom: '1.5rem' }}>
        <WeeklyPlanCard />
      </section>

      {/* Weekly Summary */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>📊 This Week</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.75rem',
          }}
        >
          <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary)' }}>
              {thisWeekRides.length}
            </div>
            <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>Rides</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary)' }}>
              {formatDistance(weekDistance)}
            </div>
            <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>Distance</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary)' }}>
              {formatElevation(weekElevation)}
            </div>
            <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>Elevation</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary)' }}>
              {formatDuration(weekTime)}
            </div>
            <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>Time</div>
          </div>
        </div>
      </section>

      {/* Fitness Progress Chart */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>📈 Fitness Progress</h2>
        <div className="card chart-container">
          <FitnessChartWrapper activities={allActivities} />
        </div>
      </section>

      {/* Recent Activities */}
      <section>
        <h2 style={{ marginBottom: '0.75rem' }}>🚴 Recent Rides</h2>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {rides.length > 0 ? (
            rides.slice(0, 10).map((activity) => <RideCard key={activity.id} activity={activity} />)
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
              <p>No recent rides found.</p>
              <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.5rem' }}>
                Go ride your bike and sync with Strava!
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Year to Date Stats */}
      {stats && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>🏆 Year to Date</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.75rem',
            }}
          >
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {stats.ytd_ride_totals.count}
              </div>
              <div style={{ opacity: 0.7, fontSize: '0.75rem' }}>Total Rides</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {formatDistance(stats.ytd_ride_totals.distance)}
              </div>
              <div style={{ opacity: 0.7, fontSize: '0.75rem' }}>Total Distance</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {formatElevation(stats.ytd_ride_totals.elevation_gain)}
              </div>
              <div style={{ opacity: 0.7, fontSize: '0.75rem' }}>Total Elevation</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {formatDuration(stats.ytd_ride_totals.moving_time)}
              </div>
              <div style={{ opacity: 0.7, fontSize: '0.75rem' }}>Total Time</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

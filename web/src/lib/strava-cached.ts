import { unstable_cache } from 'next/cache';
import { getActivities, getAthleteStats, getStarredSegments } from '@/lib/strava';
import type { StravaActivity, AthleteStats } from '@/lib/strava';

/**
 * Smart 2-layer cache for Strava activities.
 *
 * Layer 1: Check latest activity ID (TTL: 5 min) — 0 or 1 API call
 * Layer 2: Full activities fetch keyed by latest ID (TTL: 6 hours)
 *          — cache miss only when a new ride appears
 */
export async function getSmartCachedActivities(
  userId: string,
  accessToken: string,
): Promise<{ activities: StravaActivity[]; latestId: string }> {
  // Layer 1: latest activity ID (5 min TTL)
  const latestId = await unstable_cache(
    async () => {
      const [latest] = await getActivities(accessToken, 1, 1);
      return latest?.id?.toString() ?? 'none';
    },
    [`strava-latest-check-${userId}`],
    { revalidate: 300 },
  )();

  // Layer 2: all activities keyed by latest ID (6 hour TTL)
  const activities = await unstable_cache(
    async () => {
      const pages = await Promise.all(
        Array.from({ length: 9 }, (_, i) => getActivities(accessToken, i + 1, 30)),
      );
      return pages.flat();
    },
    [`strava-activities-${userId}-${latestId}`],
    { revalidate: 21600 },
  )();

  return { activities, latestId };
}

/**
 * Cached athlete stats, keyed to latest activity ID so it refreshes
 * whenever new activities appear.
 */
export async function getSmartCachedAthleteStats(
  userId: string,
  accessToken: string,
  latestActivityId: string,
): Promise<AthleteStats> {
  return unstable_cache(
    () => getAthleteStats(accessToken, userId),
    [`strava-stats-${userId}-${latestActivityId}`],
    { revalidate: 21600 },
  )();
}

/**
 * Cached starred segments (simple TTL — star changes are rare).
 */
export async function getCachedStarredSegments<T = Awaited<ReturnType<typeof getStarredSegments>>>(
  userId: string,
  accessToken: string,
): Promise<T> {
  return unstable_cache(
    () => getStarredSegments(accessToken),
    [`strava-segments-${userId}`],
    { revalidate: 21600 },
  )() as Promise<T>;
}

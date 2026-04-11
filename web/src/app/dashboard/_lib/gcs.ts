/**
 * GCS (Google Cloud Storage) utility for writing activity cache data.
 * Used by the dashboard to share activity data with the Python agent.
 */

import { StravaActivity } from '@/lib/strava';

interface ActivityCacheData {
  activities: Array<{
    id: number;
    name: string;
    type: string;
    sport_type: string;
    start_date_local: string;
    distance_km: number;
    moving_time_hours: number;
    total_elevation_gain_m: number;
    average_speed_kmh: number;
    average_watts: number | null;
    weighted_average_watts: number | null;
    average_heartrate: number | null;
    max_heartrate: number | null;
    suffer_score: number | null;
    tss_estimated: number;
  }>;
  fitness_metrics: {
    ctl: number;
    atl: number;
    tsb: number;
    weekly_tss: number;
  };
  last_updated: string;
}

interface SchemaField {
  name: string;
  type: string;
  description: string;
}

/**
 * Estimates TSS for an activity (mirrors FitnessChart.tsx logic).
 */
function estimateTSS(activity: StravaActivity, ftp: number): number {
  const hours = activity.moving_time / 3600;
  const userFTP = ftp || 200;

  if (activity.average_watts) {
    const intensityFactor = activity.average_watts / userFTP;
    return hours * intensityFactor * intensityFactor * 100;
  }

  const elevationFactor = 1 + activity.total_elevation_gain / (activity.distance / 1000) / 50;
  const baseTSS = hours * 50 * elevationFactor;
  return Math.min(baseTSS, 300);
}

/**
 * Writes activity cache to GCS for the recommendation agent to consume.
 */
export async function writeActivityCache(
  activities: StravaActivity[],
  ftp: number = 200,
): Promise<void> {
  // Dynamic import to avoid bundling GCS client in browser
  const { Storage } = await import('@google-cloud/storage');

  const storage = new Storage();
  const bucketName = process.env.GCS_BUCKET!;
  const bucket = storage.bucket(bucketName);

  const rides = activities
    .filter((a) => a.type === 'Ride' || a.type === 'VirtualRide')
    .sort(
      (a, b) => new Date(a.start_date_local).getTime() - new Date(b.start_date_local).getTime(),
    );

  // Calculate CTL/ATL/TSB
  let ctl = 0;
  let atl = 0;
  const CTL_DECAY = 42;
  const ATL_DECAY = 7;

  const processedActivities = rides.map((activity) => {
    const tss = estimateTSS(activity, ftp);

    // Update daily CTL/ATL (simplified: treat each activity as a day)
    ctl = ctl + (tss - ctl) / CTL_DECAY;
    atl = atl + (tss - atl) / ATL_DECAY;

    return {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      sport_type: activity.sport_type,
      start_date_local: activity.start_date_local,
      distance_km: Math.round((activity.distance / 1000) * 10) / 10,
      moving_time_hours: Math.round((activity.moving_time / 3600) * 100) / 100,
      total_elevation_gain_m: Math.round(activity.total_elevation_gain),
      average_speed_kmh: Math.round(activity.average_speed * 3.6 * 10) / 10,
      average_watts: activity.average_watts || null,
      weighted_average_watts: activity.weighted_average_watts || null,
      average_heartrate: activity.average_heartrate || null,
      max_heartrate: activity.max_heartrate || null,
      suffer_score: activity.suffer_score || null,
      tss_estimated: Math.round(tss),
    };
  });

  // Get recent weekly TSS
  const now = new Date();
  const weekStart = new Date(now);
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(now.getDate() - daysToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weeklyTSS = processedActivities
    .filter((a) => new Date(a.start_date_local) >= weekStart)
    .reduce((sum, a) => sum + a.tss_estimated, 0);

  const cacheData: ActivityCacheData = {
    activities: processedActivities,
    fitness_metrics: {
      ctl: Math.round(ctl),
      atl: Math.round(atl),
      tsb: Math.round(ctl - atl),
      weekly_tss: Math.round(weeklyTSS),
    },
    last_updated: new Date().toISOString(),
  };

  // Write activity cache
  const cacheBlob = bucket.file('activity_cache.json');
  await cacheBlob.save(JSON.stringify(cacheData, null, 2), {
    contentType: 'application/json',
  });

  // Write schema (only if not exists or has changed)
  const schemaBlob = bucket.file('schema.json');
  const schema: SchemaField[] = [
    { name: 'id', type: 'number', description: 'Strava activity ID' },
    { name: 'name', type: 'string', description: 'Activity name' },
    { name: 'type', type: 'string', description: 'Activity type (Ride, VirtualRide)' },
    { name: 'sport_type', type: 'string', description: 'Sport type from Strava' },
    {
      name: 'start_date_local',
      type: 'string (ISO 8601)',
      description: 'Activity start date in local timezone',
    },
    { name: 'distance_km', type: 'number', description: 'Distance in kilometers' },
    { name: 'moving_time_hours', type: 'number', description: 'Moving time in hours' },
    {
      name: 'total_elevation_gain_m',
      type: 'number',
      description: 'Total elevation gain in meters',
    },
    { name: 'average_speed_kmh', type: 'number', description: 'Average speed in km/h' },
    {
      name: 'average_watts',
      type: 'number | null',
      description: 'Average power in watts (null if no power meter)',
    },
    {
      name: 'weighted_average_watts',
      type: 'number | null',
      description: 'Normalized Power estimate (null if no power meter)',
    },
    { name: 'average_heartrate', type: 'number | null', description: 'Average heart rate in bpm' },
    { name: 'max_heartrate', type: 'number | null', description: 'Maximum heart rate in bpm' },
    {
      name: 'suffer_score',
      type: 'number | null',
      description: 'Strava Suffer Score (relative effort)',
    },
    { name: 'tss_estimated', type: 'number', description: 'Estimated Training Stress Score' },
    {
      name: 'fitness_metrics.ctl',
      type: 'number',
      description: 'Chronic Training Load (Fitness) - 42-day exponential average of TSS',
    },
    {
      name: 'fitness_metrics.atl',
      type: 'number',
      description: 'Acute Training Load (Fatigue) - 7-day exponential average of TSS',
    },
    {
      name: 'fitness_metrics.tsb',
      type: 'number',
      description:
        'Training Stress Balance (Form) = CTL - ATL. Positive = fresh, negative = fatigued',
    },
    {
      name: 'fitness_metrics.weekly_tss',
      type: 'number',
      description: 'Total TSS for the current week (Monday-Sunday)',
    },
  ];

  await schemaBlob.save(JSON.stringify(schema, null, 2), {
    contentType: 'application/json',
  });
}

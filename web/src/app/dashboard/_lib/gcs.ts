/**
 * GCS (Google Cloud Storage) utility for writing activity cache data.
 * Used by the dashboard to share activity data with the Python agent.
 */

import { StravaActivity } from '@/lib/strava';

export interface ProcessedActivity {
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
  intensity_factor: number | null;
}

export interface FitnessMetrics {
  ctl: number;
  atl: number;
  tsb: number;
  weekly_tss: number;
}

export interface FitnessComputation {
  activities: ProcessedActivity[];
  fitness_metrics: FitnessMetrics;
  last_updated: string;
}

type ActivityCacheData = FitnessComputation;

interface SchemaField {
  name: string;
  type: string;
  description: string;
}

const CTL_DECAY = 42;
const ATL_DECAY = 7;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstTimestamp(dateStr: string): number {
  const core = dateStr.replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
  const parsed = Date.parse(core + 'Z');
  return Number.isNaN(parsed) ? NaN : parsed - JST_OFFSET_MS;
}

export function parseJstClock(dateStr: string): Date | null {
  const ts = jstTimestamp(dateStr);
  return Number.isNaN(ts) ? null : new Date(ts);
}

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

function weekStartMonday(reference: Date): Date {
  const weekStart = new Date(reference);
  const dayOfWeek = reference.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(reference.getDate() - daysToMonday);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

function summarizeFromProcessed(
  processed: ProcessedActivity[],
  reference: Date,
): FitnessComputation {
  let ctl = 0;
  let atl = 0;
  for (const activity of processed) {
    const tss = activity.tss_estimated;
    ctl = ctl + (tss - ctl) / CTL_DECAY;
    atl = atl + (tss - atl) / ATL_DECAY;
  }

  const weekStart = weekStartMonday(reference);
  const weekStartTs = weekStart.getTime();
  const weeklyTSS = processed
    .filter((a) => jstTimestamp(a.start_date_local) >= weekStartTs)
    .reduce((sum, a) => sum + a.tss_estimated, 0);

  return {
    activities: processed,
    fitness_metrics: {
      ctl: Math.round(ctl),
      atl: Math.round(atl),
      tsb: Math.round(ctl - atl),
      weekly_tss: Math.round(weeklyTSS),
    },
    last_updated: reference.toISOString(),
  };
}

export function computeFitnessMetrics(
  activities: StravaActivity[],
  ftp: number = 200,
  asOf?: Date,
): FitnessComputation {
  const reference = asOf ?? new Date();
  const referenceTs = reference.getTime();
  const userFTP = ftp || 200;

  const rides = activities
    .filter((a) => a.type === 'Ride' || a.type === 'VirtualRide')
    .filter((a) => jstTimestamp(a.start_date_local) <= referenceTs)
    .sort((a, b) => jstTimestamp(a.start_date_local) - jstTimestamp(b.start_date_local));

  const processedActivities: ProcessedActivity[] = rides.map((activity) => {
    const tss = estimateTSS(activity, ftp);
    const npWatts = activity.weighted_average_watts || activity.average_watts;
    const intensityFactor = npWatts ? Math.round((npWatts / userFTP) * 100) / 100 : null;
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
      intensity_factor: intensityFactor,
    };
  });

  return summarizeFromProcessed(processedActivities, reference);
}

export function recomputeFitnessFromProcessed(
  activities: ProcessedActivity[],
  asOf: Date,
): FitnessComputation {
  const asOfTs = asOf.getTime();
  const ridesUpToAsOf = activities
    .filter((a) => jstTimestamp(a.start_date_local) <= asOfTs)
    .sort((a, b) => jstTimestamp(a.start_date_local) - jstTimestamp(b.start_date_local));
  return summarizeFromProcessed(ridesUpToAsOf, asOf);
}

export async function writeActivityCache(
  activities: StravaActivity[],
  ftp: number = 200,
): Promise<void> {
  const { Storage } = await import('@google-cloud/storage');

  const storage = new Storage();
  const bucketName = process.env.GCS_BUCKET!;
  const bucket = storage.bucket(bucketName);

  const cacheData: ActivityCacheData = computeFitnessMetrics(activities, ftp);

  const cacheBlob = bucket.file('activity_cache.json');
  await cacheBlob.save(JSON.stringify(cacheData, null, 2), {
    contentType: 'application/json',
  });

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
      name: 'intensity_factor',
      type: 'number | null',
      description:
        'Intensity Factor = NP/FTP. Proxies ride intensity: <0.75 easy, 0.75-0.85 tempo, >=0.85 hard',
    },
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

export async function readActivityCache(): Promise<ActivityCacheData | null> {
  try {
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage();
    const bucketName = process.env.GCS_BUCKET!;
    const bucket = storage.bucket(bucketName);
    const blob = bucket.file('activity_cache.json');
    const [exists] = await blob.exists();
    if (!exists) return null;
    const [buf] = await blob.download();
    return JSON.parse(buf.toString('utf-8')) as ActivityCacheData;
  } catch {
    return null;
  }
}

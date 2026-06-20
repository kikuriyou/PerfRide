import type { StravaActivity } from '@/lib/strava';

type StressActivity = Pick<
  StravaActivity,
  | 'moving_time'
  | 'elapsed_time'
  | 'distance'
  | 'total_elevation_gain'
  | 'average_watts'
  | 'weighted_average_watts'
>;

function finiteNumber(value: unknown, fallback = 0): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;

  return Number.isFinite(numeric) ? numeric : fallback;
}

function positiveNumber(value: unknown): number | null {
  const numeric = finiteNumber(value, NaN);
  return numeric > 0 ? numeric : null;
}

export function estimateActivityTss(activity: StressActivity, userFTP: number): number {
  const movingSeconds = finiteNumber(activity.moving_time);
  const elapsedSeconds = finiteNumber(activity.elapsed_time);
  const durationSeconds = movingSeconds > 0 ? movingSeconds : elapsedSeconds;

  if (durationSeconds <= 0) return 0;

  const hours = durationSeconds / 3600;
  const ftp = positiveNumber(userFTP) ?? 200;
  const power =
    positiveNumber(activity.average_watts) ?? positiveNumber(activity.weighted_average_watts);

  if (power) {
    const intensityFactor = power / ftp;
    return hours * intensityFactor * intensityFactor * 100;
  }

  const distanceKm = Math.max(0, finiteNumber(activity.distance) / 1000);
  const elevationGain = Math.max(0, finiteNumber(activity.total_elevation_gain));
  const elevationFactor = distanceKm > 0 ? 1 + elevationGain / distanceKm / 50 : 1;
  const estimated = Math.min(hours * 50 * Math.max(1, elevationFactor), 300);

  return Number.isFinite(estimated) ? estimated : 0;
}

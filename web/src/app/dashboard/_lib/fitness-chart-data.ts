import type { StravaActivity } from '@/lib/strava';
import { JST_OFFSET_MS, jstTimestamp } from '@/lib/jst-clock';
import { estimateActivityTss } from '@/lib/training-stress';

export interface WeeklyData {
  week: string;
  weekStart: Date;
  distance: number;
  elevation: number;
  time: number;
  rides: number;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

const CTL_DECAY = 42;
const ATL_DECAY = 7;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function finiteNumber(value: unknown, fallback = 0): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;

  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatUtcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKeyAsUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatWeekLabel(dateKey: string): string {
  return parseDateKeyAsUtc(dateKey).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function getJstWeekKey(timestamp: number): string {
  const jst = new Date(timestamp + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = jst.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  jst.setUTCDate(jst.getUTCDate() - daysToMonday);
  return formatUtcDateKey(jst);
}

export function processActivitiesForChart(
  activities: StravaActivity[],
  ftp: number,
  reference: Date = new Date(),
): WeeklyData[] {
  const rides = activities
    .map((activity) => ({ activity, timestamp: jstTimestamp(activity.start_date_local) }))
    .filter(
      (entry) =>
        (entry.activity.type === 'Ride' || entry.activity.type === 'VirtualRide') &&
        Number.isFinite(entry.timestamp),
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  if (rides.length === 0) return [];

  const weeklyMap = new Map<
    string,
    {
      distance: number;
      elevation: number;
      time: number;
      rides: number;
      tss: number;
      weekStart: Date;
    }
  >();

  rides.forEach(({ activity, timestamp }) => {
    const weekKey = getJstWeekKey(timestamp);

    const existing = weeklyMap.get(weekKey) || {
      distance: 0,
      elevation: 0,
      time: 0,
      rides: 0,
      tss: 0,
      weekStart: parseDateKeyAsUtc(weekKey),
    };

    const movingSeconds = finiteNumber(activity.moving_time);
    const elapsedSeconds = finiteNumber(activity.elapsed_time);
    const durationSeconds = movingSeconds > 0 ? movingSeconds : elapsedSeconds;

    existing.distance += Math.max(0, finiteNumber(activity.distance)) / 1000;
    existing.elevation += Math.max(0, finiteNumber(activity.total_elevation_gain));
    existing.time += Math.max(0, durationSeconds) / 3600;
    existing.rides += 1;
    existing.tss += estimateActivityTss(activity, ftp);

    weeklyMap.set(weekKey, existing);
  });

  const allWeeks: string[] = [];
  for (let i = 11; i >= 0; i--) {
    allWeeks.push(getJstWeekKey(reference.getTime() - i * WEEK_MS));
  }

  const weeks = allWeeks.map((weekKey) => {
    const data = weeklyMap.get(weekKey);
    if (data) {
      return [weekKey, data] as [string, typeof data];
    }
    return [
      weekKey,
      {
        distance: 0,
        elevation: 0,
        time: 0,
        rides: 0,
        tss: 0,
        weekStart: parseDateKeyAsUtc(weekKey),
      },
    ] as [
      string,
      {
        distance: number;
        elevation: number;
        time: number;
        rides: number;
        tss: number;
        weekStart: Date;
      },
    ];
  });

  let ctl = 0;
  let atl = 0;

  return weeks.map(([weekKey, data]) => {
    const tss = Number.isFinite(data.tss) ? data.tss : 0;
    const dailyTSS = tss / 7;

    for (let i = 0; i < 7; i++) {
      ctl = ctl + (dailyTSS - ctl) / CTL_DECAY;
      atl = atl + (dailyTSS - atl) / ATL_DECAY;
    }

    const tsb = ctl - atl;

    return {
      week: formatWeekLabel(weekKey),
      weekStart: data.weekStart,
      distance: Math.round(data.distance),
      elevation: Math.round(data.elevation),
      time: Math.round(data.time * 10) / 10,
      rides: data.rides,
      tss: Math.round(tss),
      ctl: Math.round(ctl),
      atl: Math.round(atl),
      tsb: Math.round(tsb),
    };
  });
}

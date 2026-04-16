import { describe, expect, it } from 'vitest';
import {
  computeFitnessMetrics,
  parseJstClock,
  recomputeFitnessFromProcessed,
  type ProcessedActivity,
} from '../gcs';
import type { StravaActivity } from '@/lib/strava';

function makeStravaActivity(overrides: Partial<StravaActivity> = {}): StravaActivity {
  return {
    id: 1,
    name: 'Test Ride',
    type: 'Ride',
    sport_type: 'Ride',
    start_date: '2026-04-10T08:00:00Z',
    start_date_local: '2026-04-10T08:00:00Z',
    distance: 30000,
    moving_time: 3600,
    elapsed_time: 3700,
    total_elevation_gain: 300,
    average_speed: 8.33,
    max_speed: 15,
    average_watts: 180,
    weighted_average_watts: 195,
    ...overrides,
  };
}

describe('computeFitnessMetrics', () => {
  it('filters non-ride activities', () => {
    const activities: StravaActivity[] = [
      makeStravaActivity({ id: 1, type: 'Ride' }),
      makeStravaActivity({ id: 2, type: 'Run' }),
      makeStravaActivity({ id: 3, type: 'VirtualRide' }),
    ];
    const result = computeFitnessMetrics(activities, 200);
    expect(result.activities.map((a) => a.id)).toEqual([1, 3]);
  });

  it('sorts activities chronologically', () => {
    const activities: StravaActivity[] = [
      makeStravaActivity({ id: 1, start_date_local: '2026-04-15T08:00:00Z' }),
      makeStravaActivity({ id: 2, start_date_local: '2026-04-10T08:00:00Z' }),
      makeStravaActivity({ id: 3, start_date_local: '2026-04-12T08:00:00Z' }),
    ];
    const result = computeFitnessMetrics(activities, 200);
    expect(result.activities.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it('estimates TSS from power', () => {
    const activities: StravaActivity[] = [
      makeStravaActivity({ id: 1, moving_time: 3600, average_watts: 200 }),
    ];
    const result = computeFitnessMetrics(activities, 200);
    expect(result.activities[0].tss_estimated).toBe(100);
  });

  it('computes intensity_factor from weighted_average_watts / FTP', () => {
    const activities: StravaActivity[] = [
      makeStravaActivity({
        id: 1,
        average_watts: 180,
        weighted_average_watts: 200,
      }),
    ];
    const result = computeFitnessMetrics(activities, 200);
    expect(result.activities[0].intensity_factor).toBe(1);
  });

  it('falls back to average_watts for IF when NP missing', () => {
    const activities: StravaActivity[] = [
      makeStravaActivity({
        id: 1,
        average_watts: 150,
        weighted_average_watts: undefined,
      }),
    ];
    const result = computeFitnessMetrics(activities, 200);
    expect(result.activities[0].intensity_factor).toBe(0.75);
  });

  it('produces CTL/ATL/TSB using EMA', () => {
    const activities: StravaActivity[] = [
      makeStravaActivity({
        id: 1,
        start_date_local: '2026-04-10T08:00:00Z',
        moving_time: 3600,
        average_watts: 200,
      }),
    ];
    const result = computeFitnessMetrics(activities, 200, new Date('2026-04-10T23:00:00Z'));
    expect(result.fitness_metrics.ctl).toBe(Math.round(100 / 42));
    expect(result.fitness_metrics.atl).toBe(Math.round(100 / 7));
  });

  it('filters activities after asOf when provided', () => {
    const activities: StravaActivity[] = [
      makeStravaActivity({ id: 1, start_date_local: '2026-04-10T08:00:00Z' }),
      makeStravaActivity({ id: 2, start_date_local: '2026-04-14T08:00:00Z' }),
      makeStravaActivity({ id: 3, start_date_local: '2026-04-20T08:00:00Z' }),
    ];
    const asOf = new Date('2026-04-15T00:00:00Z');
    const result = computeFitnessMetrics(activities, 200, asOf);
    expect(result.activities.map((a) => a.id)).toEqual([1, 2]);
    expect(result.last_updated).toBe(asOf.toISOString());
  });

  it('weekly_tss only includes rides in the reference week', () => {
    const activities: StravaActivity[] = [
      makeStravaActivity({ id: 1, start_date_local: '2026-04-06T08:00:00Z' }),
      makeStravaActivity({ id: 2, start_date_local: '2026-04-13T08:00:00Z' }),
      makeStravaActivity({ id: 3, start_date_local: '2026-04-15T08:00:00Z' }),
    ];
    const asOf = new Date('2026-04-15T23:59:00+09:00');
    const result = computeFitnessMetrics(activities, 200, asOf);
    const id2Tss =
      result.activities.find((a) => a.id === 2)?.tss_estimated ?? 0;
    const id3Tss =
      result.activities.find((a) => a.id === 3)?.tss_estimated ?? 0;
    expect(result.fitness_metrics.weekly_tss).toBe(id2Tss + id3Tss);
  });

  it('uses reference time for last_updated (current time when asOf omitted)', () => {
    const before = Date.now();
    const result = computeFitnessMetrics([], 200);
    const after = Date.now();
    const ts = new Date(result.last_updated).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('recomputeFitnessFromProcessed', () => {
  function makeProcessed(overrides: Partial<ProcessedActivity> = {}): ProcessedActivity {
    return {
      id: 1,
      name: 'Test Ride',
      type: 'Ride',
      sport_type: 'Ride',
      start_date_local: '2026-04-10T08:00:00Z',
      distance_km: 30,
      moving_time_hours: 1,
      total_elevation_gain_m: 300,
      average_speed_kmh: 30,
      average_watts: 180,
      weighted_average_watts: 195,
      average_heartrate: null,
      max_heartrate: null,
      suffer_score: null,
      tss_estimated: 100,
      intensity_factor: 0.9,
      ...overrides,
    };
  }

  it('filters activities after asOf', () => {
    const activities: ProcessedActivity[] = [
      makeProcessed({ id: 1, start_date_local: '2026-04-10T08:00:00Z' }),
      makeProcessed({ id: 2, start_date_local: '2026-04-20T08:00:00Z' }),
    ];
    const result = recomputeFitnessFromProcessed(activities, new Date('2026-04-15T00:00:00Z'));
    expect(result.activities.map((a) => a.id)).toEqual([1]);
  });

  it('reproduces CTL/ATL computation from tss_estimated values', () => {
    const activities: ProcessedActivity[] = [
      makeProcessed({
        id: 1,
        start_date_local: '2026-04-10T08:00:00Z',
        tss_estimated: 100,
      }),
    ];
    const result = recomputeFitnessFromProcessed(activities, new Date('2026-04-10T23:00:00Z'));
    expect(result.fitness_metrics.ctl).toBe(Math.round(100 / 42));
    expect(result.fitness_metrics.atl).toBe(Math.round(100 / 7));
  });

  it('produces same CTL/ATL/TSB as computeFitnessMetrics on identical raw data', () => {
    const raw: StravaActivity[] = [
      makeStravaActivity({
        id: 1,
        start_date_local: '2026-04-10T08:00:00Z',
        moving_time: 3600,
        average_watts: 200,
      }),
      makeStravaActivity({
        id: 2,
        start_date_local: '2026-04-12T08:00:00Z',
        moving_time: 3600,
        average_watts: 150,
      }),
    ];
    const asOf = new Date('2026-04-13T12:00:00Z');
    const full = computeFitnessMetrics(raw, 200, asOf);
    const replay = recomputeFitnessFromProcessed(full.activities, asOf);
    expect(replay.fitness_metrics).toEqual(full.fitness_metrics);
  });

  it('sets last_updated to asOf', () => {
    const asOf = new Date('2026-04-15T23:59:00+09:00');
    const result = recomputeFitnessFromProcessed([], asOf);
    expect(result.last_updated).toBe(asOf.toISOString());
  });

  it('treats Strava start_date_local Z suffix as JST clock time', () => {
    const activities: ProcessedActivity[] = [
      makeProcessed({ id: 1, start_date_local: '2026-03-08T08:00:00Z' }),
    ];
    const asOf = parseJstClock('2026-03-08T12:00');
    expect(asOf).not.toBeNull();
    const result = recomputeFitnessFromProcessed(activities, asOf!);
    expect(result.activities.map((a) => a.id)).toEqual([1]);
  });

  it('excludes rides whose JST clock time is after asOf clock time on same date', () => {
    const activities: ProcessedActivity[] = [
      makeProcessed({ id: 1, start_date_local: '2026-03-08T14:00:00Z' }),
    ];
    const asOf = parseJstClock('2026-03-08T12:00');
    const result = recomputeFitnessFromProcessed(activities, asOf!);
    expect(result.activities).toEqual([]);
  });
});

describe('parseJstClock', () => {
  it('parses datetime-local string as JST clock time', () => {
    const d = parseJstClock('2026-03-08T12:00');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-03-08T03:00:00.000Z');
  });

  it('parses Strava misleading-Z local string as JST clock time', () => {
    const d = parseJstClock('2026-03-08T08:00:00Z');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-03-07T23:00:00.000Z');
  });

  it('returns null for invalid input', () => {
    expect(parseJstClock('not-a-date')).toBeNull();
  });
});

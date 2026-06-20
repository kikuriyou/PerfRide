import { describe, expect, it } from 'vitest';
import { estimateActivityTss } from '../training-stress';
import type { StravaActivity } from '@/lib/strava';

function makeActivity(overrides: Partial<StravaActivity> = {}): StravaActivity {
  return {
    id: 1,
    name: 'Test Ride',
    type: 'Ride',
    sport_type: 'Ride',
    start_date: '2026-06-08T08:00:00Z',
    start_date_local: '2026-06-08T08:00:00Z',
    distance: 30000,
    moving_time: 3600,
    elapsed_time: 3700,
    total_elevation_gain: 300,
    average_speed: 8.33,
    max_speed: 15,
    ...overrides,
  };
}

describe('estimateActivityTss', () => {
  it('uses power when average watts is available', () => {
    const tss = estimateActivityTss(makeActivity({ average_watts: 200 }), 200);
    expect(tss).toBe(100);
  });

  it('falls back to elapsed time when moving time is missing', () => {
    const tss = estimateActivityTss(
      makeActivity({
        moving_time: 0,
        elapsed_time: 3600,
        average_watts: undefined,
        total_elevation_gain: 0,
      }),
      200,
    );
    expect(tss).toBe(50);
  });

  it('does not return NaN when no-power elevation data is missing', () => {
    const tss = estimateActivityTss(
      makeActivity({
        average_watts: undefined,
        total_elevation_gain: undefined as unknown as number,
      }),
      200,
    );
    expect(Number.isFinite(tss)).toBe(true);
    expect(tss).toBe(50);
  });

  it('does not return NaN when no-power distance and elevation are zero', () => {
    const tss = estimateActivityTss(
      makeActivity({
        average_watts: undefined,
        distance: 0,
        total_elevation_gain: 0,
      }),
      200,
    );
    expect(Number.isFinite(tss)).toBe(true);
    expect(tss).toBe(50);
  });
});

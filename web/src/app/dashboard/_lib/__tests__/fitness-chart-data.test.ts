import { describe, expect, it } from 'vitest';
import { processActivitiesForChart } from '../fitness-chart-data';
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

describe('processActivitiesForChart', () => {
  const reference = new Date('2026-06-20T12:00:00+09:00');

  it('keeps Jun 8 chart values finite when a ridden week has missing elevation', () => {
    const data = processActivitiesForChart(
      [
        makeActivity({
          id: 1,
          start_date_local: '2026-06-08T08:00:00Z',
          average_watts: undefined,
          total_elevation_gain: undefined as unknown as number,
        }),
      ],
      200,
      reference,
    );

    const jun8 = data.find((week) => week.week === 'Jun 8');
    expect(jun8).toMatchObject({
      rides: 1,
      distance: 30,
      tss: 50,
    });
    expect(Number.isFinite(jun8?.ctl)).toBe(true);
    expect(Number.isFinite(jun8?.atl)).toBe(true);
    expect(Number.isFinite(jun8?.tsb)).toBe(true);
  });

  it('treats Strava start_date_local Z values as JST clock time', () => {
    const data = processActivitiesForChart(
      [
        makeActivity({
          id: 1,
          start_date_local: '2026-06-07T23:30:00Z',
          average_watts: 200,
        }),
      ],
      200,
      reference,
    );

    expect(data.find((week) => week.week === 'Jun 1')?.rides).toBe(1);
    expect(data.find((week) => week.week === 'Jun 8')?.rides).toBe(0);
  });
});

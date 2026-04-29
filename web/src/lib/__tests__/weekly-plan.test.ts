import { describe, expect, it } from 'vitest';

import type { GCSTrainingPlan, WeeklyPlanReviewStore } from '@/lib/gcs-schema';
import {
  approvedWeekForDate,
  buildPlanContextKey,
  getCurrentPlanContext,
  isoDate,
  mondayOfWeek,
} from '@/lib/weekly-plan';

describe('isoDate (JST)', () => {
  it('returns the JST calendar day even when UTC is still on the previous day', () => {
    // 2026-04-26T22:30Z is 2026-04-27T07:30 JST.
    const ref = new Date('2026-04-26T22:30:00Z');
    expect(isoDate(ref)).toBe('2026-04-27');
  });

  it('matches UTC when the wall clock is the same day', () => {
    const ref = new Date('2026-04-26T05:00:00Z'); // 14:00 JST same date
    expect(isoDate(ref)).toBe('2026-04-26');
  });
});

describe('mondayOfWeek (JST)', () => {
  it('rolls a JST Sunday back to the Monday of that JST week', () => {
    // 2026-04-26 (Sun JST) → Monday 2026-04-20.
    const ref = new Date('2026-04-26T00:30:00+09:00');
    expect(mondayOfWeek(ref)).toBe('2026-04-20');
  });

  it('returns the same date when called on a JST Monday', () => {
    const ref = new Date('2026-04-20T08:00:00+09:00');
    expect(mondayOfWeek(ref)).toBe('2026-04-20');
  });

  it('uses the JST date even at UTC times that look like the previous day', () => {
    // 2026-04-26T20:00Z is 2026-04-27T05:00 JST → Monday 2026-04-27.
    const ref = new Date('2026-04-26T20:00:00Z');
    expect(mondayOfWeek(ref)).toBe('2026-04-27');
  });
});

const approvedPlan: GCSTrainingPlan = {
  user_id: 'u1',
  plan_id: 'plan_2026-04-06',
  goal_event: 'race',
  current_phase: 'build1',
  phases: [],
  weekly_plan: {
    week_15: {
      week_start: '2026-04-06',
      week_number: 15,
      phase: 'build1',
      target_tss: 320,
      plan_revision: 3,
      status: 'approved',
      summary: 'approved week',
      sessions: [
        { date: '2026-04-06', type: 'rest', status: 'planned' },
        {
          date: '2026-04-07',
          type: 'tempo',
          duration_minutes: 75,
          target_tss: 70,
          status: 'planned',
        },
        {
          date: '2026-04-08',
          type: 'recovery',
          duration_minutes: 45,
          target_tss: 25,
          status: 'planned',
        },
        {
          date: '2026-04-09',
          type: 'sweetspot',
          duration_minutes: 80,
          target_tss: 75,
          status: 'planned',
        },
        { date: '2026-04-10', type: 'rest', status: 'planned' },
        {
          date: '2026-04-11',
          type: 'endurance',
          duration_minutes: 150,
          target_tss: 80,
          status: 'planned',
        },
        {
          date: '2026-04-12',
          type: 'recovery',
          duration_minutes: 45,
          target_tss: 20,
          status: 'planned',
        },
      ],
      updated_at: '2026-04-06T04:00:00+09:00',
      updated_by: 'weekly_plan_agent',
    },
  },
  updated_at: '2026-04-06T04:00:00+09:00',
  updated_by: 'weekly_plan_agent',
};

const pendingReview: WeeklyPlanReviewStore = {
  reviews: {
    'weekly_2026-04-06': {
      review_id: 'weekly_2026-04-06',
      week_start: '2026-04-06',
      plan_revision: 4,
      status: 'pending',
      draft: {
        ...approvedPlan.weekly_plan.week_15,
        plan_revision: 4,
        status: 'pending',
        summary: 'pending week',
      },
      created_at: '2026-04-06T04:00:00+09:00',
    },
  },
  updated_at: '2026-04-06T04:00:00+09:00',
};

describe('buildPlanContextKey', () => {
  it('builds the expected key format', () => {
    expect(buildPlanContextKey('coach', '2026-04-06', 4, 'pending')).toBe(
      'coach:2026-04-06:4:pending',
    );
  });
});

describe('approvedWeekForDate', () => {
  it('selects the week that covers the configured reference date', () => {
    const week = approvedWeekForDate(approvedPlan, '2026-04-08');
    expect(week?.week_start).toBe('2026-04-06');
  });

  it('can select by week_start range even when a session date is missing', () => {
    const sparsePlan: GCSTrainingPlan = {
      ...approvedPlan,
      weekly_plan: {
        week_17: {
          ...approvedPlan.weekly_plan.week_15,
          week_start: '2026-04-20',
          sessions: [{ date: '2026-04-20', type: 'rest', status: 'planned' }],
        },
      },
    };
    const week = approvedWeekForDate(sparsePlan, '2026-04-22');
    expect(week?.week_start).toBe('2026-04-20');
  });
});

describe('getCurrentPlanContext', () => {
  it('returns suggest when coach mode is off', () => {
    const result = getCurrentPlanContext(
      'suggest',
      approvedPlan,
      pendingReview,
      new Date('2026-04-08T00:00:00Z'),
    );
    expect(result.source).toBe('suggest');
    expect(result.planContextKey).toBeNull();
  });

  it('prefers approved current week over pending draft', () => {
    const result = getCurrentPlanContext(
      'coach',
      approvedPlan,
      pendingReview,
      new Date('2026-04-08T00:00:00Z'),
    );
    expect(result.source).toBe('approved');
    expect(result.week?.sessions?.find((s) => s.date === '2026-04-08')?.type).toBe('recovery');
    expect(result.planContextKey).toBe('coach:2026-04-06:3:approved');
  });

  it('falls back to pending draft when approved plan is absent', () => {
    const result = getCurrentPlanContext(
      'coach',
      null,
      pendingReview,
      new Date('2026-04-08T00:00:00Z'),
    );
    expect(result.source).toBe('pending');
    expect(result.planContextKey).toBe('coach:2026-04-06:4:pending');
  });
});

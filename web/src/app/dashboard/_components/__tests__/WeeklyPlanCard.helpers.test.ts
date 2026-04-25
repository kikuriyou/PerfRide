import { describe, expect, it } from 'vitest';
import {
  plannedSessionCount,
  shouldRenderWeeklyPlanCard,
} from '../weekly-plan-card-helpers';

describe('shouldRenderWeeklyPlanCard', () => {
  const baseWeek = { sessions: [] };

  it('hides the card when data is null', () => {
    expect(shouldRenderWeeklyPlanCard(null)).toBe(false);
  });

  it('hides the card outside coach autonomy', () => {
    expect(
      shouldRenderWeeklyPlanCard({
        coach_autonomy: 'suggest',
        current_week: baseWeek,
        pending_review: null,
      }),
    ).toBe(false);
  });

  it('hides the card when there is neither a week nor a pending review', () => {
    expect(
      shouldRenderWeeklyPlanCard({
        coach_autonomy: 'coach',
        current_week: null,
        pending_review: null,
      }),
    ).toBe(false);
  });

  it('shows the card when a week is present', () => {
    expect(
      shouldRenderWeeklyPlanCard({
        coach_autonomy: 'coach',
        current_week: baseWeek,
        pending_review: null,
      }),
    ).toBe(true);
  });

  it('shows the card when only a pending review is present', () => {
    expect(
      shouldRenderWeeklyPlanCard({
        coach_autonomy: 'coach',
        current_week: null,
        pending_review: { review_id: 'weekly_2026-04-20' },
      }),
    ).toBe(true);
  });
});

describe('plannedSessionCount', () => {
  it('returns 0 when there is no week', () => {
    expect(plannedSessionCount(null)).toBe(0);
  });

  it('counts only non-rest, non-skipped sessions', () => {
    const week = {
      sessions: [
        { type: 'rest', status: 'planned' },
        { type: 'tempo', status: 'planned' },
        { type: 'endurance', status: 'skipped' },
        { type: 'recovery', status: 'completed' },
        { type: 'threshold', status: 'registered' },
      ],
    };
    expect(plannedSessionCount(week)).toBe(3);
  });
});

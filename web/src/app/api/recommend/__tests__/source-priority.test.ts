import { describe, expect, it } from 'vitest';
import {
  decisionResponse,
  latestTodayActivity,
  validWebhookDecision,
  weeklyPlanRecommendation,
} from '../route';
import type { ApprovedWeekPayload, CoachDecisionRecord } from '@/lib/gcs-schema';

const today = '2026-04-27';

describe('recommend source priority helpers', () => {
  it('finds the latest activity for the current JST date', () => {
    const activity = latestTodayActivity(
      {
        activities: [
          { id: 1, start_date_local: '2026-04-26T22:00:00' },
          { id: 2, start_date_local: '2026-04-27T06:00:00' },
          { id: 3, start_date_local: '2026-04-27T19:00:00' },
        ],
      },
      today,
    );

    expect(activity?.id).toBe(3);
  });

  it('keeps webhook decisions valid only for the same day and latest activity', () => {
    const decision: CoachDecisionRecord = {
      source: 'webhook',
      source_label: 'Webhook decision',
      summary: 'next workout',
      activity_id: 3,
      created_at: '2026-04-27T10:00:00Z',
      valid_for_date: today,
    };

    expect(validWebhookDecision(decision, today, { id: 3 })).toBe(decision);
    expect(validWebhookDecision(decision, today, { id: 4 })).toBeNull();
    expect(validWebhookDecision(decision, '2026-04-28', { id: 3 })).toBeNull();
  });

  it('builds a Monday weekly plan recommendation from the next non-rest session', () => {
    const week: ApprovedWeekPayload = {
      week_start: today,
      week_number: 18,
      phase: 'base',
      target_tss: 120,
      plan_revision: 4,
      status: 'approved',
      updated_at: '2026-04-27T00:00:00Z',
      updated_by: 'planner',
      sessions: [
        { date: today, type: 'rest', status: 'planned', target_tss: 0 },
        { date: '2026-04-28', type: 'endurance', status: 'planned', target_tss: 45 },
      ],
    };

    const rec = weeklyPlanRecommendation(week, today);
    expect(rec?.source).toBe('weekly_plan');
    expect(rec?.source_label).toBe('今週のプラン');
    expect(rec?.proposed_session).toMatchObject({
      session_date: '2026-04-28',
      session_type: 'endurance',
      source: 'weekly_plan',
    });
  });

  it('preserves structured webhook decision fields in the response', () => {
    const response = decisionResponse({
      source: 'webhook',
      source_label: 'Webhook decision',
      summary: 'VO2は避けて耐久走',
      detail: 'fatigue is high',
      created_at: '2026-04-27T10:00:00Z',
      valid_for_date: today,
      proposed_session: { session_date: today, session_type: 'endurance' },
    });

    expect(response).toMatchObject({
      source: 'webhook',
      source_label: 'Webhook decision',
      proposed_session: { session_date: today, session_type: 'endurance' },
    });
  });
});

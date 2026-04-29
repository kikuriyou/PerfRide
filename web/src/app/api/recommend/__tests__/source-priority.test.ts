import { describe, expect, it } from 'vitest';
import {
  decisionResponse,
  latestTodayActivity,
  priorityDecisionResponse,
  validWebhookDecision,
} from '../route';
import type { CoachDecisionRecord } from '@/lib/gcs-schema';

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

  it('does not build a weekly plan priority recommendation when webhook is absent', () => {
    expect(priorityDecisionResponse(null, today, null)).toBeNull();
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
      proposed_session: { session_date: today, session_type: 'endurance' },
    });
    expect(response).not.toHaveProperty('source_label');
  });
});

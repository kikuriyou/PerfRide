import { describe, expect, it } from 'vitest';
import { buildWebhookDecision } from '../route';
import type { ProcessedActivity } from '@/app/dashboard/_lib/gcs';

const activity: ProcessedActivity = {
  id: 123,
  name: 'Morning Ride',
  type: 'Ride',
  sport_type: 'Ride',
  start_date_local: '2026-04-27T07:30:00',
  distance_km: 20,
  moving_time_hours: 1,
  total_elevation_gain_m: 150,
  average_speed_kmh: 25,
  average_watts: 180,
  weighted_average_watts: 190,
  average_heartrate: null,
  max_heartrate: null,
  suffer_score: null,
  tss_estimated: 55,
  intensity_factor: 0.9,
};

describe('buildWebhookDecision', () => {
  it('stores the agent proposed_session with activity and trace metadata', () => {
    const decision = buildWebhookDecision(
      {
        session_id: 'adk-session',
        trace_id: 'trace-from-agent',
        summary: '次は軽め',
        why_now: '疲労が高め',
        proposed_session: {
          session_date: '2026-04-28',
          session_type: 'endurance',
          duration_minutes: 45,
          target_tss: 35,
          registered: true,
          workout_id: 'workout-1',
        },
      },
      activity,
      'trace-from-webhook',
    );

    expect(decision).toMatchObject({
      source: 'webhook',
      source_label: 'アクティビティ後の提案',
      summary: '次は軽め',
      why_now: '疲労が高め',
      activity_id: 123,
      session_id: 'adk-session',
      trace_id: 'trace-from-agent',
      valid_for_date: '2026-04-27',
      proposed_session: {
        session_date: '2026-04-28',
        session_type: 'endurance',
        workout_id: 'workout-1',
        registered: true,
      },
    });
  });
});

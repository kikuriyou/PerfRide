import { describe, expect, it } from 'vitest';

import { normalizeGcsUserId, normalizeTrainingPlan, userObjectPath } from '@/lib/gcs-settings';

describe('GCS user paths', () => {
  it('builds user-scoped object paths', () => {
    expect(userObjectPath(123, 'settings.json')).toBe('users/123/settings.json');
    expect(userObjectPath('athlete-1', '/integrations/mywhoosh.json')).toBe(
      'users/athlete-1/integrations/mywhoosh.json',
    );
  });

  it('rejects unsafe user ids', () => {
    expect(() => normalizeGcsUserId('../123')).toThrow(/Invalid/);
  });
});

describe('training plan normalization', () => {
  it('tolerates legacy plans without phases', () => {
    const plan = normalizeTrainingPlan({
      user_id: 'u1',
      plan_id: 'plan_2026-04-27',
      goal_event: 'race',
      current_phase: 'build1',
      weekly_plan: {
        week_18: {
          week_start: '2026-04-27',
          week_number: 18,
          phase: 'build1',
          target_tss: 100,
          plan_revision: 1,
          status: 'approved',
          sessions: [
            { date: '2026-04-27', type: 'endurance', status: 'planned' },
            null,
            { date: '2026-04-28', status: 'planned' },
          ],
          updated_at: '2026-04-27T04:00:00+09:00',
          updated_by: 'weekly_plan_agent',
        },
      },
      updated_at: '2026-04-27T04:00:00+09:00',
      updated_by: 'weekly_plan_agent',
    });

    expect(plan.phases).toEqual([]);
    expect(plan.weekly_plan.week_18.sessions).toHaveLength(1);
    expect(plan.weekly_plan.week_18.sessions[0].session_id).toBe('baseline:2026-04-27:2026-04-27');
  });

  it('tolerates missing weekly_plan', () => {
    const plan = normalizeTrainingPlan({
      user_id: 'u1',
      plan_id: 'plan_2026-04-27',
      goal_event: 'race',
      current_phase: 'build1',
      phases: [{ name: 'unknown-phase', start: '2026-04-27', end: '2026-05-03' }],
      updated_at: '2026-04-27T04:00:00+09:00',
      updated_by: 'weekly_plan_agent',
    });

    expect(plan.phases[0].name).toBe('custom');
    expect(plan.weekly_plan).toEqual({});
  });
});

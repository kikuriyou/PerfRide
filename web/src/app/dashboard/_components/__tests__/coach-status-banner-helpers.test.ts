import { describe, expect, it } from 'vitest';
import {
  buildCoachStatusCandidates,
  dismissCoachStatusItem,
  selectCoachStatusItem,
} from '../coach-status-banner-helpers';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('coach status banner helpers', () => {
  it('selects webhook before weekly plan updates', () => {
    const items = buildCoachStatusCandidates({
      webhookDecision: { activity_id: 123, created_at: '2026-04-29T01:00:00Z' },
      currentWeek: { week_start: '2026-04-27', plan_revision: 2 },
    });

    expect(selectCoachStatusItem(items, new Set())?.message).toBe(
      '最新ライドから、おすすめを更新しました。',
    );
  });

  it('builds weekly created and updated CTA items', () => {
    expect(
      buildCoachStatusCandidates({
        currentWeek: { week_start: '2026-04-27', plan_revision: 1 },
      })[0],
    ).toMatchObject({
      id: 'weekly:2026-04-27:1',
      message: '今週のプランを作成しました。',
      href: '/weekly-plan',
    });

    expect(
      buildCoachStatusCandidates({
        currentWeek: { week_start: '2026-04-27', plan_revision: 3 },
      })[0]?.message,
    ).toBe('今週のプランを更新しました。');
  });

  it('skips dismissed items', () => {
    const storage = memoryStorage();
    const items = buildCoachStatusCandidates({
      webhookDecision: { activity_id: 123 },
      currentWeek: { week_start: '2026-04-27', plan_revision: 2 },
    });

    dismissCoachStatusItem(storage, 'webhook:123');
    expect(selectCoachStatusItem(items, new Set(['webhook:123']))?.id).toBe('weekly:2026-04-27:2');
  });
});

import { describe, expect, it } from 'vitest';

import { intervalsIcuSaveMessage, intervalsIcuTestMessage } from '../SettingsForm';

describe('intervalsIcuSaveMessage', () => {
  const base = { configured: true, athlete_id: '0', updated_at: '2026-05-02T00:00:00Z' };

  it('does not imply verification when save returns no verification result', () => {
    expect(intervalsIcuSaveMessage({ ...base, verification: null })).toBe('Saved');
  });

  it('reports verified credentials', () => {
    expect(
      intervalsIcuSaveMessage({
        ...base,
        verification: {
          ok: true,
          status: 'verified',
          message: 'ok',
          checked_at: '2026-05-02T00:00:00Z',
        },
      }),
    ).toContain('succeeded');
  });

  it('reports failed verification separately from save', () => {
    expect(
      intervalsIcuSaveMessage({
        ...base,
        verification: {
          ok: false,
          status: 'failed',
          message: 'Intervals.icu connection failed',
          checked_at: '2026-05-02T00:00:00Z',
        },
      }),
    ).toContain('Saved, but');
  });
});

describe('intervalsIcuTestMessage', () => {
  const base = { configured: true, athlete_id: '0', updated_at: '2026-05-02T00:00:00Z' };

  it('mentions MyWhoosh sync lag after a verified connection', () => {
    expect(
      intervalsIcuTestMessage({
        ...base,
        verification: {
          ok: true,
          status: 'verified',
          message: 'Intervals.icu API key verified',
          checked_at: '2026-05-02T00:00:00Z',
        },
      }),
    ).toContain('few minutes');
  });

  it('reports skipped checks without save wording', () => {
    expect(
      intervalsIcuTestMessage({
        ...base,
        verification: {
          ok: false,
          status: 'skipped',
          message: 'agent unreachable',
          checked_at: '2026-05-02T00:00:00Z',
        },
      }),
    ).not.toContain('Saved');
  });
});

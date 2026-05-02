import { describe, expect, it } from 'vitest';

import { myWhooshSaveMessage, myWhooshTestMessage } from '../SettingsForm';

describe('myWhooshSaveMessage', () => {
  const base = { configured: true, email: 'u@example.com', updated_at: '2026-05-02T00:00:00Z' };

  it('does not imply verification when save returns no verification result', () => {
    expect(myWhooshSaveMessage({ ...base, verification: null })).toBe('保存しました');
  });

  it('reports verified credentials', () => {
    expect(
      myWhooshSaveMessage({
        ...base,
        verification: {
          ok: true,
          status: 'verified',
          message: 'ok',
          checked_at: '2026-05-02T00:00:00Z',
        },
      }),
    ).toContain('成功');
  });

  it('reports failed verification separately from save', () => {
    expect(
      myWhooshSaveMessage({
        ...base,
        verification: {
          ok: false,
          status: 'failed',
          message: 'MyWhoosh login failed',
          checked_at: '2026-05-02T00:00:00Z',
        },
      }),
    ).toContain('保存しましたが');
  });

  it('reports already logged in verification distinctly', () => {
    expect(
      myWhooshSaveMessage({
        ...base,
        verification: {
          ok: false,
          status: 'already_logged_in',
          message: 'MyWhoosh account is already logged in from another device.',
          checked_at: '2026-05-02T00:00:00Z',
        },
      }),
    ).toContain('別デバイス');
  });
});

describe('myWhooshTestMessage', () => {
  const base = { configured: true, email: 'u@example.com', updated_at: '2026-05-02T00:00:00Z' };

  it('reports already logged in without save wording', () => {
    expect(
      myWhooshTestMessage({
        ...base,
        verification: {
          ok: false,
          status: 'already_logged_in',
          message: 'MyWhoosh account is already logged in from another device.',
          checked_at: '2026-05-02T00:00:00Z',
        },
      }),
    ).not.toContain('保存');
  });
});

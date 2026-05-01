import { describe, expect, it } from 'vitest';

import { myWhooshSaveMessage } from '../SettingsForm';

describe('myWhooshSaveMessage', () => {
  const base = { configured: true, email: 'u@example.com', updated_at: '2026-05-02T00:00:00Z' };

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
});

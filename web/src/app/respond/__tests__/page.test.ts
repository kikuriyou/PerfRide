import { describe, expect, it } from 'vitest';

import { resolveRespondMode } from '@/app/respond/page';

describe('resolveRespondMode', () => {
  it('treats review_id as weekly review context', () => {
    const params = new URLSearchParams({
      kind: 'weekly_review',
      review_id: 'weekly_2026-04-06',
      action: 'open_review',
    });
    expect(resolveRespondMode(params)).toEqual({
      kind: 'weekly',
      reviewId: 'weekly_2026-04-06',
      sessionId: '',
      action: 'open_review',
    });
  });
});

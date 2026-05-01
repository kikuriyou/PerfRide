import { describe, expect, it } from 'vitest';

import { buildRespondUrl } from '@/lib/respond-url';

describe('buildRespondUrl', () => {
  it('merges metadata and action without duplicating question marks', () => {
    const url = buildRespondUrl(
      '/respond?foo=1',
      {
        kind: 'weekly_review',
        review_id: 'weekly_2026-04-06',
        plan_revision: 4,
        respond_path: '/respond',
      },
      'approve',
    );

    expect(url).toBe(
      '/respond?foo=1&kind=weekly_review&review_id=weekly_2026-04-06&plan_revision=4&action=approve',
    );
  });
});

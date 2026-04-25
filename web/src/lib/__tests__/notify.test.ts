import { describe, expect, it } from 'vitest';

import { buildFlexMessage } from '@/app/api/notify/route';
import { buildLinePostbackData, buildPushPayloadData } from '@/lib/notify';

describe('notify helpers', () => {
  it('builds weekly review postback data with review_id and revision', () => {
    const data = buildLinePostbackData(
      { id: 'approve', label: '承認' },
      {
        kind: 'weekly_review',
        review_id: 'weekly_2026-04-06',
        week_start: '2026-04-06',
        plan_revision: 4,
        respond_path: '/respond',
      },
    );

    expect(data).toContain('action=approve');
    expect(data).toContain('kind=weekly_review');
    expect(data).toContain('review_id=weekly_2026-04-06');
    expect(data).toContain('plan_revision=4');
  });

  it('keeps weekly review metadata in push payload', () => {
    expect(
      buildPushPayloadData({
        kind: 'weekly_review',
        review_id: 'weekly_2026-04-06',
        week_start: '2026-04-06',
        plan_revision: 4,
        respond_path: '/respond',
      }),
    ).toMatchObject({
      review_id: 'weekly_2026-04-06',
      respond_path: '/respond',
      plan_revision: 4,
    });
  });

  it('builds flex message buttons with weekly postback payload', () => {
    const flex = buildFlexMessage('title', 'body', [{ id: 'approve', label: '承認' }], {
      kind: 'weekly_review',
      review_id: 'weekly_2026-04-06',
      plan_revision: 4,
    });

    const footer = flex.contents.footer;
    expect(footer).toBeDefined();
    if (!footer) {
      throw new Error('footer missing');
    }
    const button = footer.contents[0];
    expect(button.action.data).toContain('kind=weekly_review');
    expect(button.action.data).toContain('review_id=weekly_2026-04-06');
  });
});

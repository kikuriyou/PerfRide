import { describe, expect, it } from 'vitest';

import { resolveLineForwardUrl } from '@/app/api/line/webhook/route';

describe('resolveLineForwardUrl', () => {
  const request = new Request('https://perfride.local/api/line/webhook') as never;

  it('routes weekly review postbacks to the weekly proxy route', () => {
    expect(resolveLineForwardUrl(request, 'weekly_review', 'http://localhost:8000')).toBe(
      'https://perfride.local/api/weekly-plan/respond',
    );
  });

  it('keeps daily postbacks on the existing agent route', () => {
    expect(resolveLineForwardUrl(request, undefined, 'http://localhost:8000')).toBe(
      'http://localhost:8000/recommend/respond',
    );
  });
});

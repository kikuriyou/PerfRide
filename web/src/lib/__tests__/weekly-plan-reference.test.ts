import { describe, expect, it } from 'vitest';
import { decodeAsOfCookie, resolveWeeklyPlanReference } from '@/lib/weekly-plan-reference';
import { isoDate } from '@/lib/weekly-plan';

describe('weekly plan reference helpers', () => {
  it('uses asOf as a JST confirmation time', () => {
    const result = resolveWeeklyPlanReference('2026-04-27T23:30');
    expect(isoDate(result.reference)).toBe('2026-04-27');
    expect(result.asOf).toBe('2026-04-27T23:30');
  });

  it('falls back when asOf is missing or invalid', () => {
    const fallback = new Date('2026-04-28T00:00:00Z');
    expect(resolveWeeklyPlanReference(null, fallback)).toEqual({
      reference: fallback,
      asOf: null,
    });
    expect(resolveWeeklyPlanReference('not-a-date', fallback)).toEqual({
      reference: fallback,
      asOf: null,
    });
  });

  it('decodes asOf cookie values', () => {
    expect(decodeAsOfCookie('2026-04-27T23%3A30')).toBe('2026-04-27T23:30');
  });
});

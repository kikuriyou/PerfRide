import { describe, it, expect } from 'vitest';
import {
  buildWeekDays,
  groupSessionsByDate,
  sessionTypeMeta,
  statusBadgeMeta,
} from '../_lib/session-display';

describe('buildWeekDays', () => {
  it('returns 7 consecutive days starting from the given Monday', () => {
    const days = buildWeekDays('2026-04-20');
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: '2026-04-20', label: 'Mon' });
    expect(days[6]).toEqual({ date: '2026-04-26', label: 'Sun' });
  });
});

describe('sessionTypeMeta', () => {
  it('returns canonical metadata for known types', () => {
    expect(sessionTypeMeta('threshold').label).toBe('Threshold');
    expect(sessionTypeMeta('vo2max').label).toBe('VO2max');
    expect(sessionTypeMeta('rest').label).toBe('Rest');
  });

  it('falls back gracefully for unknown types', () => {
    const meta = sessionTypeMeta('unknown_kind');
    expect(meta.label).toBe('unknown_kind');
    expect(meta.color).toBeTruthy();
  });
});

describe('statusBadgeMeta', () => {
  it('returns dedicated styling for each known status', () => {
    expect(statusBadgeMeta('completed').label).toBe('Completed');
    expect(statusBadgeMeta('skipped').label).toBe('Skipped');
  });
});

describe('groupSessionsByDate', () => {
  it('places same-date sessions together with baseline before appended', () => {
    const sessions = [
      { date: '2026-04-25', origin: 'appended' as const, type: 'endurance' },
      { date: '2026-04-25', origin: 'baseline' as const, type: 'tempo' },
      { date: '2026-04-26', origin: 'baseline' as const, type: 'rest' },
    ];

    const grouped = groupSessionsByDate(sessions);
    expect(grouped['2026-04-25']).toHaveLength(2);
    expect(grouped['2026-04-25'][0].type).toBe('tempo');
    expect(grouped['2026-04-25'][1].type).toBe('endurance');
    expect(grouped['2026-04-26']).toHaveLength(1);
  });

  it('treats missing origin as baseline', () => {
    const sessions = [
      { date: '2026-04-25', type: 'tempo' },
      { date: '2026-04-25', origin: 'appended' as const, type: 'endurance' },
    ];

    const grouped = groupSessionsByDate(sessions);
    expect(grouped['2026-04-25'][0].type).toBe('tempo');
    expect(grouped['2026-04-25'][1].type).toBe('endurance');
  });

  it('returns an empty map for no sessions', () => {
    expect(groupSessionsByDate([])).toEqual({});
  });
});

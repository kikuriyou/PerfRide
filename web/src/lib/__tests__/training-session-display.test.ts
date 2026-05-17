import { describe, expect, it } from 'vitest';
import {
  formatSessionBrief,
  formatSessionDuration,
  formatSessionType,
  formatShortDate,
} from '@/lib/training-session-display';

describe('training session display helpers', () => {
  it('formats short dates without leading zeroes', () => {
    expect(formatShortDate('2026-04-28')).toBe('4/28');
  });

  it('formats known workout types', () => {
    expect(formatSessionType('sweetspot')).toBe('Sweetspot');
    expect(formatSessionType('vo2max')).toBe('VO2 Max');
  });

  it('does not mix workout types with rest labels', () => {
    expect(formatSessionDuration({ type: 'sweetspot' })).toBe('Duration TBD');
    expect(formatSessionBrief({ type: 'sweetspot' })).toBe('Sweetspot Duration TBD');
    expect(formatSessionBrief({ type: 'rest', duration_minutes: 45 })).toBe('Rest');
  });
});

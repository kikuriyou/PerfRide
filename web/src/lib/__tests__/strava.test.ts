import { describe, expect, it } from 'vitest';
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatSpeed,
  getClimbCategoryLabel,
} from '../strava';

describe('formatDistance', () => {
  it('converts meters to km with one decimal', () => {
    expect(formatDistance(1500)).toBe('1.5 km');
  });

  it('handles zero', () => {
    expect(formatDistance(0)).toBe('0.0 km');
  });

  it('handles large distance', () => {
    expect(formatDistance(100000)).toBe('100.0 km');
  });
});

describe('formatDuration', () => {
  it('formats minutes only', () => {
    expect(formatDuration(300)).toBe('5m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3720)).toBe('1h 2m');
  });

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('formatSpeed', () => {
  it('converts m/s to km/h', () => {
    expect(formatSpeed(10)).toBe('36.0 km/h');
  });

  it('handles zero', () => {
    expect(formatSpeed(0)).toBe('0.0 km/h');
  });
});

describe('formatElevation', () => {
  it('rounds and appends m', () => {
    expect(formatElevation(123.7)).toBe('124m');
  });

  it('handles zero', () => {
    expect(formatElevation(0)).toBe('0m');
  });
});

describe('getClimbCategoryLabel', () => {
  it('returns HC for category 5', () => {
    expect(getClimbCategoryLabel(5)).toBe('HC');
  });

  it('returns Cat 1 for category 4', () => {
    expect(getClimbCategoryLabel(4)).toBe('Cat 1');
  });

  it('returns Cat 2 for category 3', () => {
    expect(getClimbCategoryLabel(3)).toBe('Cat 2');
  });

  it('returns Cat 3 for category 2', () => {
    expect(getClimbCategoryLabel(2)).toBe('Cat 3');
  });

  it('returns Cat 4 for category 1', () => {
    expect(getClimbCategoryLabel(1)).toBe('Cat 4');
  });

  it('returns NC for category 0', () => {
    expect(getClimbCategoryLabel(0)).toBe('NC');
  });

  it('returns NC for unknown category', () => {
    expect(getClimbCategoryLabel(-1)).toBe('NC');
  });
});

import { describe, expect, it } from 'vitest';
import { calculateClimbingTime, formatTime, TIRE_TYPES } from '../physics';

describe('calculateClimbingTime', () => {
  const baseParams = {
    riderWeight: 70,
    bikeWeight: 8,
    power: 250,
    distance: 10000,
    elevationGain: 500,
    averageGrade: 5,
  };

  it('returns positive finite values for typical climb', () => {
    const result = calculateClimbingTime(baseParams);

    expect(result.estimatedTimeSeconds).toBeGreaterThan(0);
    expect(result.averageSpeedKmh).toBeGreaterThan(0);
    expect(result.vam).toBeGreaterThan(0);
    expect(Number.isFinite(result.estimatedTimeSeconds)).toBe(true);
  });

  it('computes watts/kg correctly', () => {
    const result = calculateClimbingTime(baseParams);
    expect(result.wattsPerKg).toBeCloseTo(250 / 70, 5);
  });

  it('higher power yields shorter time', () => {
    const slow = calculateClimbingTime({ ...baseParams, power: 200 });
    const fast = calculateClimbingTime({ ...baseParams, power: 300 });
    expect(fast.estimatedTimeSeconds).toBeLessThan(slow.estimatedTimeSeconds);
  });

  it('heavier rider is slower at same power', () => {
    const light = calculateClimbingTime({ ...baseParams, riderWeight: 60 });
    const heavy = calculateClimbingTime({ ...baseParams, riderWeight: 80 });
    expect(heavy.estimatedTimeSeconds).toBeGreaterThan(light.estimatedTimeSeconds);
  });

  it('gravel tires are slower than road tires', () => {
    const road = calculateClimbingTime({ ...baseParams, tireType: 'road' });
    const gravel = calculateClimbingTime({ ...baseParams, tireType: 'gravel' });
    expect(gravel.estimatedTimeSeconds).toBeGreaterThan(road.estimatedTimeSeconds);
  });

  it('gravel crr is higher than road crr', () => {
    expect(TIRE_TYPES.gravel.crr).toBeGreaterThan(TIRE_TYPES.road.crr);
  });

  it('VAM is consistent with time and elevation', () => {
    const result = calculateClimbingTime(baseParams);
    const timeHours = result.estimatedTimeSeconds / 3600;
    const expectedVam = baseParams.elevationGain / timeHours;
    expect(result.vam).toBeCloseTo(expectedVam, 0);
  });
});

describe('formatTime', () => {
  it('formats seconds-only as M:SS', () => {
    expect(formatTime(45)).toBe('0:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(125)).toBe('2:05');
  });

  it('formats hours, minutes and seconds', () => {
    expect(formatTime(3661)).toBe('1:01:01');
  });

  it('pads minutes and seconds with leading zeros', () => {
    expect(formatTime(3600)).toBe('1:00:00');
  });
});

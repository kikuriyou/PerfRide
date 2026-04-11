import { describe, expect, it } from 'vitest';
import {
  calculateNP,
  calculateVelocity,
  discretizeCourse,
  optimizePacing,
  type CourseProfile,
  type RiderParams,
  type SegmentData,
} from '../paceOptimizer';

// --- helpers ---

const flatCourse: CourseProfile = {
  name: 'Flat 2km',
  totalDistance: 2000,
  points: [
    { distance: 0, elevation: 0 },
    { distance: 2000, elevation: 0 },
  ],
};

const hillCourse: CourseProfile = {
  name: 'Hill Climb',
  totalDistance: 2000,
  points: [
    { distance: 0, elevation: 0 },
    { distance: 500, elevation: 0 },
    { distance: 1500, elevation: 100 },
    { distance: 2000, elevation: 100 },
  ],
};

const rider: RiderParams = {
  riderWeight: 70,
  bikeWeight: 8,
  targetNP: 250,
};

// --- discretizeCourse ---

describe('discretizeCourse', () => {
  it('returns the requested number of segments', () => {
    const segments = discretizeCourse(flatCourse, 10);
    expect(segments).toHaveLength(10);
  });

  it('each segment has the correct length', () => {
    const segments = discretizeCourse(flatCourse, 10);
    for (const seg of segments) {
      expect(seg.distance).toBeCloseTo(200, 5);
    }
  });

  it('flat course has zero gradient', () => {
    const segments = discretizeCourse(flatCourse, 10);
    for (const seg of segments) {
      expect(seg.gradient).toBeCloseTo(0, 5);
    }
  });

  it('hill course has positive gradient in climbing section', () => {
    const segments = discretizeCourse(hillCourse, 20);
    // Midpoint segments (around index 5-14) should climb
    const climbingSegments = segments.filter((s) => s.gradient > 0.01);
    expect(climbingSegments.length).toBeGreaterThan(0);
  });
});

// --- calculateVelocity ---

describe('calculateVelocity', () => {
  const flatSegment: SegmentData = { distance: 100, gradient: 0, wind: 0 };
  const uphillSegment: SegmentData = { distance: 100, gradient: 0.1, wind: 0 };
  const totalMass = 78;

  it('returns a positive velocity', () => {
    const v = calculateVelocity(250, flatSegment, totalMass);
    expect(v).toBeGreaterThan(0);
  });

  it('higher power yields higher velocity on flat', () => {
    const v1 = calculateVelocity(200, flatSegment, totalMass);
    const v2 = calculateVelocity(300, flatSegment, totalMass);
    expect(v2).toBeGreaterThan(v1);
  });

  it('uphill is slower than flat at same power', () => {
    const vFlat = calculateVelocity(250, flatSegment, totalMass);
    const vUp = calculateVelocity(250, uphillSegment, totalMass);
    expect(vUp).toBeLessThan(vFlat);
  });

  it('wind changes velocity', () => {
    const noWind = calculateVelocity(250, flatSegment, totalMass);
    const withWind = calculateVelocity(250, { ...flatSegment, wind: 5 }, totalMass);
    expect(withWind).not.toBeCloseTo(noWind, 1);
  });
});

// --- calculateNP ---

describe('calculateNP', () => {
  it('returns 0 for empty input', () => {
    expect(calculateNP([], [])).toBe(0);
  });

  it('constant power returns that power value', () => {
    const powers = [200, 200, 200, 200];
    const times = [10, 10, 10, 10];
    expect(calculateNP(powers, times)).toBeCloseTo(200, 1);
  });

  it('NP >= average power for variable power', () => {
    const powers = [100, 300, 100, 300];
    const times = [10, 10, 10, 10];
    const np = calculateNP(powers, times);
    const avg = powers.reduce((a, b) => a + b, 0) / powers.length;
    expect(np).toBeGreaterThanOrEqual(avg);
  });
});

// --- optimizePacing ---

describe('optimizePacing', () => {
  it('hill course has non-negative improvement', () => {
    const result = optimizePacing(hillCourse, rider, { numSegments: 20 });
    expect(result.improvement).toBeGreaterThanOrEqual(0);
  });

  it('returns correct number of data points', () => {
    const n = 20;
    const result = optimizePacing(hillCourse, rider, { numSegments: n });
    expect(result.powerProfile).toHaveLength(n);
    expect(result.velocityProfile).toHaveLength(n);
    expect(result.distancePoints).toHaveLength(n);
  });

  it('actual NP is close to target NP', () => {
    const result = optimizePacing(hillCourse, rider, { numSegments: 20 });
    expect(result.actualNP).toBeCloseTo(rider.targetNP, 0);
  });

  it('estimated time is positive', () => {
    const result = optimizePacing(flatCourse, rider, { numSegments: 20 });
    expect(result.estimatedTime).toBeGreaterThan(0);
    expect(result.constantPowerTime).toBeGreaterThan(0);
  });
});

/**
 * Pace Optimization for Individual Time Trial
 * Based on: "A numerical design methodology for optimal pacing strategy
 * in the individual time trial discipline of cycling"
 * https://link.springer.com/article/10.1007/s12283-025-00493-9
 */

// Physical constants
const GRAVITY = 9.81; // m/s²
const AIR_DENSITY = 1.225; // kg/m³ (sea level, 15°C)
const DRAG_COEFFICIENT = 0.88; // Typical TT position
const FRONTAL_AREA = 0.35; // m² (TT position)
const ROLLING_RESISTANCE = 0.004;
const DRIVETRAIN_LOSS = 0.03; // 3% loss

// Types
export interface CoursePoint {
  distance: number; // meters from start
  elevation: number; // meters
  wind?: number; // m/s (positive = headwind)
}

export interface CourseProfile {
  name: string;
  points: CoursePoint[];
  totalDistance: number; // meters
}

export interface RiderParams {
  riderWeight: number; // kg
  bikeWeight: number; // kg
  targetNP: number; // watts (target Normalized Power)
  dragCoefficient?: number;
  frontalArea?: number;
}

export interface SegmentData {
  distance: number; // segment length (m)
  gradient: number; // slope (ratio, not %)
  wind: number; // m/s
}

export interface OptimizationResult {
  powerProfile: number[];
  velocityProfile: number[];
  distancePoints: number[];
  estimatedTime: number; // seconds
  constantPowerTime: number; // seconds (baseline comparison)
  improvement: number; // percentage
  actualNP: number;
}

/**
 * Interpolate course point at given distance
 */
function interpolatePoint(
  points: CoursePoint[],
  distance: number,
): { elevation: number; wind: number } {
  if (points.length === 0) return { elevation: 0, wind: 0 };
  if (distance <= points[0].distance)
    return { elevation: points[0].elevation, wind: points[0].wind ?? 0 };
  if (distance >= points[points.length - 1].distance) {
    const last = points[points.length - 1];
    return { elevation: last.elevation, wind: last.wind ?? 0 };
  }

  for (let i = 0; i < points.length - 1; i++) {
    if (distance >= points[i].distance && distance <= points[i + 1].distance) {
      const t = (distance - points[i].distance) / (points[i + 1].distance - points[i].distance);
      const elevation = points[i].elevation + t * (points[i + 1].elevation - points[i].elevation);
      const wind1 = points[i].wind ?? 0;
      const wind2 = points[i + 1].wind ?? 0;
      const wind = wind1 + t * (wind2 - wind1);
      return { elevation, wind };
    }
  }

  return { elevation: 0, wind: 0 };
}

/**
 * Discretize course into uniform segments
 */
export function discretizeCourse(profile: CourseProfile, numSegments: number = 100): SegmentData[] {
  const { points, totalDistance } = profile;
  const segmentLength = totalDistance / numSegments;
  const segments: SegmentData[] = [];

  for (let i = 0; i < numSegments; i++) {
    const startDist = i * segmentLength;
    const endDist = (i + 1) * segmentLength;

    const { elevation: startElev, wind: startWind } = interpolatePoint(points, startDist);
    const { elevation: endElev, wind: endWind } = interpolatePoint(points, endDist);

    const gradient = (endElev - startElev) / segmentLength;
    const wind = (startWind + endWind) / 2;

    segments.push({
      distance: segmentLength,
      gradient,
      wind,
    });
  }

  return segments;
}

/**
 * Calculate velocity from power for a given segment
 * Solves: P = v * (Fg + Fr + Fa)
 */
export function calculateVelocity(
  power: number,
  segment: SegmentData,
  totalMass: number,
  Cd: number = DRAG_COEFFICIENT,
  A: number = FRONTAL_AREA,
): number {
  const effectivePower = power * (1 - DRIVETRAIN_LOSS);
  const { gradient, wind } = segment;
  const theta = Math.atan(gradient);

  const Fg = totalMass * GRAVITY * Math.sin(theta);
  const Fr = ROLLING_RESISTANCE * totalMass * GRAVITY * Math.cos(theta);

  let v = 5.0;

  for (let iter = 0; iter < 30; iter++) {
    const vRel = v - wind;
    const Fa = 0.5 * AIR_DENSITY * Cd * A * vRel * Math.abs(vRel);

    const totalResistance = Fg + Fr + Fa;
    const f = effectivePower - v * totalResistance;

    const dFa_dv = AIR_DENSITY * Cd * A * Math.abs(vRel);
    const df_dv = -(totalResistance + v * dFa_dv);

    if (Math.abs(df_dv) < 1e-10) break;

    const dv = -f / df_dv;
    v = v + dv;
    v = Math.max(0.5, Math.min(25, v));

    if (Math.abs(dv) < 1e-6) break;
  }

  return Math.max(0.5, v);
}

/**
 * Calculate Normalized Power (NP) = (mean(P^4))^(1/4)
 */
export function calculateNP(powers: number[], times: number[]): number {
  if (powers.length === 0) return 0;

  let sum = 0;
  let totalTime = 0;

  for (let i = 0; i < powers.length; i++) {
    const p4 = Math.pow(Math.max(0, powers[i]), 4);
    const dt = times[i] || 1;
    sum += p4 * dt;
    totalTime += dt;
  }

  if (totalTime === 0) return 0;
  return Math.pow(sum / totalTime, 0.25);
}

/**
 * Calculate total time for a power profile
 */
function calculateTotalTime(
  powers: number[],
  segments: SegmentData[],
  totalMass: number,
  Cd: number,
  A: number,
): { totalTime: number; velocities: number[]; segmentTimes: number[] } {
  const velocities: number[] = [];
  const segmentTimes: number[] = [];
  let totalTime = 0;

  for (let i = 0; i < segments.length; i++) {
    const v = calculateVelocity(powers[i], segments[i], totalMass, Cd, A);
    velocities.push(v);
    const dt = segments[i].distance / v;
    segmentTimes.push(dt);
    totalTime += dt;
  }

  return { totalTime, velocities, segmentTimes };
}

/**
 * Main optimization function
 *
 * Strategy: Apply higher power where velocity is low (climbs) and lower power
 * where velocity is high (descents), while keeping NP constant.
 *
 * The key insight is that NP penalizes power variation (due to P^4), so we need
 * to find the optimal balance between varying power for time savings and keeping
 * the variation small enough to not violate the NP constraint.
 */
export function optimizePacing(
  profile: CourseProfile,
  params: RiderParams,
  options: {
    numSegments?: number;
    maxIterations?: number;
    variationStrength?: number;
  } = {},
): OptimizationResult {
  const {
    numSegments = 100,
    maxIterations = 100,
    variationStrength = 0.15, // Controls how much power varies (0 = constant, higher = more variation)
  } = options;

  const totalMass = params.riderWeight + params.bikeWeight;
  const Cd = params.dragCoefficient ?? DRAG_COEFFICIENT;
  const A = params.frontalArea ?? FRONTAL_AREA;
  const targetNP = params.targetNP;

  // Discretize course
  const segments = discretizeCourse(profile, numSegments);
  const distancePoints = segments.map((_, i) => (i + 0.5) * (profile.totalDistance / numSegments));

  // Calculate baseline (constant power) time
  const constantPowers = new Array(numSegments).fill(targetNP);
  const baseline = calculateTotalTime(constantPowers, segments, totalMass, Cd, A);
  const constantPowerTime = baseline.totalTime;
  const baseVelocities = baseline.velocities;

  // Compute power adjustment based on velocity ratios
  // Where velocity is low (climbs), increase power; where high (descents), decrease
  const avgVelocity = baseVelocities.reduce((a, b) => a + b, 0) / baseVelocities.length;

  // Calculate optimal power distribution
  // Based on calculus of variations: optimal power ∝ (1/v)^α where α is tuned
  let powers: number[] = [];
  for (let i = 0; i < numSegments; i++) {
    const velocityRatio = avgVelocity / baseVelocities[i];
    // Apply controlled variation: P = P_target * (1 + strength * (ratio - 1))
    // This creates small variations around the target
    const factor = 1 + variationStrength * (velocityRatio - 1);
    powers.push(targetNP * factor);
  }

  // Iteratively adjust to match NP constraint exactly
  for (let iter = 0; iter < maxIterations; iter++) {
    const { segmentTimes } = calculateTotalTime(powers, segments, totalMass, Cd, A);
    const currentNP = calculateNP(powers, segmentTimes);

    if (Math.abs(currentNP - targetNP) < 0.01) break;

    // Scale powers to match target NP exactly
    // For NP = (mean(P^4))^0.25, scaling all P by k scales NP by k
    const scaleFactor = targetNP / currentNP;
    powers = powers.map((p) => p * scaleFactor);
  }

  // Calculate final results
  const final = calculateTotalTime(powers, segments, totalMass, Cd, A);
  const actualNP = calculateNP(powers, final.segmentTimes);
  const improvement = ((constantPowerTime - final.totalTime) / constantPowerTime) * 100;

  // If no improvement (or worse), something's wrong - return constant power
  if (improvement <= 0) {
    // Try different variation strengths to find the optimal one
    let bestTime = constantPowerTime;
    let bestPowers = constantPowers;

    for (let strength = 0.05; strength <= 0.5; strength += 0.05) {
      let testPowers: number[] = [];
      for (let i = 0; i < numSegments; i++) {
        const velocityRatio = avgVelocity / baseVelocities[i];
        const factor = 1 + strength * (velocityRatio - 1);
        testPowers.push(targetNP * factor);
      }

      // Scale to match NP
      for (let iter = 0; iter < 50; iter++) {
        const { segmentTimes } = calculateTotalTime(testPowers, segments, totalMass, Cd, A);
        const np = calculateNP(testPowers, segmentTimes);
        if (Math.abs(np - targetNP) < 0.1) break;
        testPowers = testPowers.map((p) => p * (targetNP / np));
      }

      const result = calculateTotalTime(testPowers, segments, totalMass, Cd, A);
      if (result.totalTime < bestTime) {
        bestTime = result.totalTime;
        bestPowers = testPowers;
      }
    }

    const finalResult = calculateTotalTime(bestPowers, segments, totalMass, Cd, A);
    const finalNP = calculateNP(bestPowers, finalResult.segmentTimes);
    const finalImprovement =
      ((constantPowerTime - finalResult.totalTime) / constantPowerTime) * 100;

    return {
      powerProfile: bestPowers,
      velocityProfile: finalResult.velocities,
      distancePoints,
      estimatedTime: finalResult.totalTime,
      constantPowerTime,
      improvement: Math.max(0, finalImprovement),
      actualNP: finalNP,
    };
  }

  return {
    powerProfile: powers,
    velocityProfile: final.velocities,
    distancePoints,
    estimatedTime: final.totalTime,
    constantPowerTime,
    improvement: Math.max(0, improvement),
    actualNP,
  };
}

/**
 * Create preset course profiles for testing
 */
export function getPresetCourses(): CourseProfile[] {
  return [
    {
      name: 'Flat 2km',
      totalDistance: 2000,
      points: [
        { distance: 0, elevation: 0 },
        { distance: 2000, elevation: 0 },
      ],
    },
    {
      name: 'Hill Climb (1km @ 10%)',
      totalDistance: 2000,
      points: [
        { distance: 0, elevation: 0 },
        { distance: 500, elevation: 0 },
        { distance: 1500, elevation: 100 },
        { distance: 2000, elevation: 100 },
      ],
    },
    {
      name: 'Roller (500m up, 500m down)',
      totalDistance: 2000,
      points: [
        { distance: 0, elevation: 0 },
        { distance: 500, elevation: 0 },
        { distance: 1000, elevation: 50 },
        { distance: 1500, elevation: 0 },
        { distance: 2000, elevation: 0 },
      ],
    },
    {
      name: 'Wind (tailwind then headwind)',
      totalDistance: 2000,
      points: [
        { distance: 0, elevation: 0, wind: -5 },
        { distance: 1000, elevation: 0, wind: -5 },
        { distance: 1001, elevation: 0, wind: 5 },
        { distance: 2000, elevation: 0, wind: 5 },
      ],
    },
    {
      name: 'TT Course (10km)',
      totalDistance: 10000,
      points: [
        { distance: 0, elevation: 0 },
        { distance: 2000, elevation: 20 },
        { distance: 4000, elevation: 80 },
        { distance: 6000, elevation: 40 },
        { distance: 8000, elevation: 100 },
        { distance: 10000, elevation: 60 },
      ],
    },
  ];
}

/**
 * Format time in MM:SS or HH:MM:SS format
 */
export function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

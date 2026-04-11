/**
 * Physics-based climbing time calculator
 * Based on the power-balance equation for cycling
 */

// Tire type definitions with Crr values
export const TIRE_TYPES = {
  road: {
    id: 'road',
    label: '🚴 ロードタイヤ',
    description: '標準',
    crr: 0.004,
  },
  gravel: {
    id: 'gravel',
    label: '🌲 グラベルタイヤ',
    description: 'やや遅め',
    crr: 0.005,
  },
} as const;

export type TireType = keyof typeof TIRE_TYPES;

interface SimulationParams {
  riderWeight: number; // kg
  bikeWeight: number; // kg
  power: number; // watts (average sustained power)
  distance: number; // meters
  elevationGain: number; // meters
  averageGrade: number; // percentage (e.g., 5 for 5%)
  tireType?: TireType; // tire type selection
}

interface SimulationResult {
  estimatedTimeSeconds: number;
  averageSpeedKmh: number;
  vam: number; // Vertical Ascent in Meters per hour
  wattsPerKg: number;
}

// Constants
const GRAVITY = 9.81; // m/s²
const AIR_DENSITY = 1.225; // kg/m³ (at sea level, 15°C)
const DRAG_COEFFICIENT = 0.88; // Typical for road cyclist
const FRONTAL_AREA = 0.45; // m² (bracket position)
const DRIVETRAIN_LOSS = 0.03; // 3% loss

export function calculateClimbingTime(params: SimulationParams): SimulationResult {
  const { riderWeight, bikeWeight, power, distance, elevationGain, tireType = 'road' } = params;

  const totalMass = riderWeight + bikeWeight;
  const effectivePower = power * (1 - DRIVETRAIN_LOSS);
  const wattsPerKg = power / riderWeight;
  const rollingResistance = TIRE_TYPES[tireType].crr;

  // Calculate grade from elevation and distance
  const grade = elevationGain / distance;

  // For climbing, we can simplify: P = (m * g * v * sin(θ)) + rolling + aero
  // At low speeds on steep grades, aero is minimal
  // sin(θ) ≈ grade for small angles

  // Gravity component per unit velocity
  const gravityForcePerVelocity = totalMass * GRAVITY * grade;

  // Rolling resistance force
  const rollingForce = rollingResistance * totalMass * GRAVITY * Math.cos(Math.atan(grade));

  // For steep climbs, solve: P = v * (gravityForce + rollingForce + 0.5 * ρ * Cd * A * v²)
  // This is a cubic equation. For simplicity, use iterative approach or simplified model.

  // Simplified: assume aero drag is small on climbs (< 20 km/h), so:
  // v ≈ P / (gravityForce + rollingForce)

  const resistanceForce = gravityForcePerVelocity + rollingForce;

  // Initial velocity estimate (ignoring aero)
  let velocity = effectivePower / resistanceForce;

  // Refine with aero drag (Newton-Raphson like iteration)
  for (let i = 0; i < 10; i++) {
    const aeroDrag = 0.5 * AIR_DENSITY * DRAG_COEFFICIENT * FRONTAL_AREA * velocity * velocity;
    const totalResistance = resistanceForce + aeroDrag / velocity;
    velocity = effectivePower / totalResistance;
  }

  // Clamp velocity to reasonable values
  velocity = Math.max(velocity, 0.5); // At least 1.8 km/h
  velocity = Math.min(velocity, 20); // Cap at 72 km/h (for safety in calcs)

  const timeSeconds = distance / velocity;
  const averageSpeedKmh = velocity * 3.6;

  // VAM = (elevation gain / time in hours) * 1000
  const timeHours = timeSeconds / 3600;
  const vam = elevationGain / timeHours;

  return {
    estimatedTimeSeconds: Math.round(timeSeconds),
    averageSpeedKmh: Math.round(averageSpeedKmh * 10) / 10,
    vam: Math.round(vam),
    wattsPerKg,
  };
}

export function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

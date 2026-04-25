import type { WorkoutInterval } from '@/types/workout';
import type { PhaseName } from '@/lib/gcs-schema';

export interface Workout {
  day: string;
  name: string;
  duration: string;
  durationMin: number;
  description: string;
  intensity: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'sprint';
  icon: string;
  intervals: WorkoutInterval[];
}

export interface TrainingPhase {
  name: string;
  description: string;
  weekCount: number;
  intensity: 'low' | 'medium' | 'high' | 'recovery';
  focus: string;
  color: string;
  weeklyWorkouts: Workout[];
}

export interface TrainingPlan {
  targetDate: Date;
  totalWeeks: number;
  phases: TrainingPhase[];
  weeklySchedule: WeekSchedule[];
}

export interface WeekSchedule {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  phase: TrainingPhase;
}

// Workout templates per phase with interval structures
export const WORKOUT_TEMPLATES: Record<PhaseName, Workout[]> = {
  base: [
    {
      day: 'Mon',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Complete rest or light stretching',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Tue',
      name: 'Endurance Ride',
      duration: '1.5h',
      durationMin: 90,
      description: 'Zone 2, steady pace, flat to rolling terrain',
      intensity: 'endurance',
      icon: '🚴',
      intervals: [{ startMin: 0, endMin: 90, powerPercent: 65, label: 'Endurance' }],
    },
    {
      day: 'Wed',
      name: 'Recovery Spin',
      duration: '45min',
      durationMin: 45,
      description: 'Very easy, high cadence, stay in Zone 1',
      intensity: 'recovery',
      icon: '🔄',
      intervals: [{ startMin: 0, endMin: 45, powerPercent: 50, label: 'Recovery' }],
    },
    {
      day: 'Thu',
      name: 'Endurance Ride',
      duration: '1.5h',
      durationMin: 90,
      description: 'Zone 2, include some short climbs',
      intensity: 'endurance',
      icon: '🚴',
      intervals: [{ startMin: 0, endMin: 90, powerPercent: 68, label: 'Endurance' }],
    },
    {
      day: 'Fri',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Rest or yoga/stretching',
      intensity: 'recovery',
      icon: '🧘',
      intervals: [],
    },
    {
      day: 'Sat',
      name: 'Long Ride',
      duration: '3-4h',
      durationMin: 210,
      description: 'Zone 2, build aerobic base',
      intensity: 'endurance',
      icon: '🏔️',
      intervals: [{ startMin: 0, endMin: 210, powerPercent: 62, label: 'Long Endurance' }],
    },
    {
      day: 'Sun',
      name: 'Easy Spin',
      duration: '1h',
      durationMin: 60,
      description: 'Recovery ride, enjoy the scenery',
      intensity: 'recovery',
      icon: '☀️',
      intervals: [{ startMin: 0, endMin: 60, powerPercent: 50, label: 'Recovery' }],
    },
  ],
  build1: [
    {
      day: 'Mon',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Complete rest',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Tue',
      name: 'Sweet Spot',
      duration: '1.5h',
      durationMin: 90,
      description: '3x15min @ 88-93% FTP, 5min recovery',
      intensity: 'tempo',
      icon: '🔥',
      intervals: [
        { startMin: 0, endMin: 15, powerPercent: 55, label: 'Warmup' },
        { startMin: 15, endMin: 30, powerPercent: 90, label: 'SS 1' },
        { startMin: 30, endMin: 35, powerPercent: 50, label: 'Rest' },
        { startMin: 35, endMin: 50, powerPercent: 90, label: 'SS 2' },
        { startMin: 50, endMin: 55, powerPercent: 50, label: 'Rest' },
        { startMin: 55, endMin: 70, powerPercent: 90, label: 'SS 3' },
        { startMin: 70, endMin: 90, powerPercent: 55, label: 'Cooldown' },
      ],
    },
    {
      day: 'Wed',
      name: 'Recovery Spin',
      duration: '45min',
      durationMin: 45,
      description: 'Zone 1, flush the legs',
      intensity: 'recovery',
      icon: '🔄',
      intervals: [{ startMin: 0, endMin: 45, powerPercent: 50, label: 'Recovery' }],
    },
    {
      day: 'Thu',
      name: 'Tempo Intervals',
      duration: '1.5h',
      durationMin: 90,
      description: '2x20min @ 76-87% FTP',
      intensity: 'tempo',
      icon: '⚡',
      intervals: [
        { startMin: 0, endMin: 15, powerPercent: 55, label: 'Warmup' },
        { startMin: 15, endMin: 35, powerPercent: 82, label: 'Tempo 1' },
        { startMin: 35, endMin: 45, powerPercent: 50, label: 'Rest' },
        { startMin: 45, endMin: 65, powerPercent: 82, label: 'Tempo 2' },
        { startMin: 65, endMin: 90, powerPercent: 55, label: 'Cooldown' },
      ],
    },
    {
      day: 'Fri',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Rest or light activity',
      intensity: 'recovery',
      icon: '🧘',
      intervals: [],
    },
    {
      day: 'Sat',
      name: 'Long Ride w/ Tempo',
      duration: '3h',
      durationMin: 180,
      description: 'Include 2x30min tempo blocks',
      intensity: 'tempo',
      icon: '🏔️',
      intervals: [
        { startMin: 0, endMin: 30, powerPercent: 60, label: 'Warmup' },
        { startMin: 30, endMin: 60, powerPercent: 80, label: 'Tempo 1' },
        { startMin: 60, endMin: 90, powerPercent: 60, label: 'Endurance' },
        { startMin: 90, endMin: 120, powerPercent: 80, label: 'Tempo 2' },
        { startMin: 120, endMin: 180, powerPercent: 60, label: 'Endurance' },
      ],
    },
    {
      day: 'Sun',
      name: 'Endurance Ride',
      duration: '2h',
      durationMin: 120,
      description: 'Zone 2, active recovery',
      intensity: 'endurance',
      icon: '🚴',
      intervals: [{ startMin: 0, endMin: 120, powerPercent: 65, label: 'Endurance' }],
    },
  ],
  build2: [
    {
      day: 'Mon',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Complete rest',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Tue',
      name: 'VO2max Intervals',
      duration: '1.5h',
      durationMin: 90,
      description: '5x4min @ 106-120% FTP, 4min recovery',
      intensity: 'vo2max',
      icon: '💀',
      intervals: [
        { startMin: 0, endMin: 15, powerPercent: 55, label: 'Warmup' },
        { startMin: 15, endMin: 19, powerPercent: 115, label: 'VO2 1' },
        { startMin: 19, endMin: 23, powerPercent: 50, label: 'Rest' },
        { startMin: 23, endMin: 27, powerPercent: 115, label: 'VO2 2' },
        { startMin: 27, endMin: 31, powerPercent: 50, label: 'Rest' },
        { startMin: 31, endMin: 35, powerPercent: 115, label: 'VO2 3' },
        { startMin: 35, endMin: 39, powerPercent: 50, label: 'Rest' },
        { startMin: 39, endMin: 43, powerPercent: 115, label: 'VO2 4' },
        { startMin: 43, endMin: 47, powerPercent: 50, label: 'Rest' },
        { startMin: 47, endMin: 51, powerPercent: 115, label: 'VO2 5' },
        { startMin: 51, endMin: 90, powerPercent: 50, label: 'Cooldown' },
      ],
    },
    {
      day: 'Wed',
      name: 'Recovery Spin',
      duration: '45min',
      durationMin: 45,
      description: 'Zone 1, easy spinning',
      intensity: 'recovery',
      icon: '🔄',
      intervals: [{ startMin: 0, endMin: 45, powerPercent: 50, label: 'Recovery' }],
    },
    {
      day: 'Thu',
      name: 'Threshold Intervals',
      duration: '1.5h',
      durationMin: 90,
      description: '2x20min @ 95-105% FTP',
      intensity: 'threshold',
      icon: '🔥',
      intervals: [
        { startMin: 0, endMin: 15, powerPercent: 55, label: 'Warmup' },
        { startMin: 15, endMin: 35, powerPercent: 100, label: 'FTP 1' },
        { startMin: 35, endMin: 45, powerPercent: 50, label: 'Rest' },
        { startMin: 45, endMin: 65, powerPercent: 100, label: 'FTP 2' },
        { startMin: 65, endMin: 90, powerPercent: 50, label: 'Cooldown' },
      ],
    },
    {
      day: 'Fri',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Complete rest before weekend',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Sat',
      name: 'Race Simulation',
      duration: '2.5h',
      durationMin: 150,
      description: 'Simulate race effort on target climb',
      intensity: 'threshold',
      icon: '🏁',
      intervals: [
        { startMin: 0, endMin: 30, powerPercent: 60, label: 'Warmup' },
        { startMin: 30, endMin: 90, powerPercent: 95, label: 'Race Pace' },
        { startMin: 90, endMin: 150, powerPercent: 55, label: 'Cooldown' },
      ],
    },
    {
      day: 'Sun',
      name: 'Easy Spin',
      duration: '1h',
      durationMin: 60,
      description: 'Recovery, Zone 1',
      intensity: 'recovery',
      icon: '☀️',
      intervals: [{ startMin: 0, endMin: 60, powerPercent: 50, label: 'Recovery' }],
    },
  ],
  peak: [
    {
      day: 'Mon',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Complete rest',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Tue',
      name: 'Opener Intervals',
      duration: '1h',
      durationMin: 60,
      description: '3x3min @ race pace, full recovery',
      intensity: 'threshold',
      icon: '⚡',
      intervals: [
        { startMin: 0, endMin: 15, powerPercent: 55, label: 'Warmup' },
        { startMin: 15, endMin: 18, powerPercent: 105, label: 'Opener 1' },
        { startMin: 18, endMin: 25, powerPercent: 50, label: 'Rest' },
        { startMin: 25, endMin: 28, powerPercent: 105, label: 'Opener 2' },
        { startMin: 28, endMin: 35, powerPercent: 50, label: 'Rest' },
        { startMin: 35, endMin: 38, powerPercent: 105, label: 'Opener 3' },
        { startMin: 38, endMin: 60, powerPercent: 50, label: 'Cooldown' },
      ],
    },
    {
      day: 'Wed',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Complete rest',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Thu',
      name: 'Short VO2max',
      duration: '1h',
      durationMin: 60,
      description: '4x2min @ 120% FTP, 3min recovery',
      intensity: 'vo2max',
      icon: '💀',
      intervals: [
        { startMin: 0, endMin: 15, powerPercent: 55, label: 'Warmup' },
        { startMin: 15, endMin: 17, powerPercent: 120, label: 'VO2 1' },
        { startMin: 17, endMin: 20, powerPercent: 50, label: 'Rest' },
        { startMin: 20, endMin: 22, powerPercent: 120, label: 'VO2 2' },
        { startMin: 22, endMin: 25, powerPercent: 50, label: 'Rest' },
        { startMin: 25, endMin: 27, powerPercent: 120, label: 'VO2 3' },
        { startMin: 27, endMin: 30, powerPercent: 50, label: 'Rest' },
        { startMin: 30, endMin: 32, powerPercent: 120, label: 'VO2 4' },
        { startMin: 32, endMin: 60, powerPercent: 50, label: 'Cooldown' },
      ],
    },
    {
      day: 'Fri',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Rest and prepare mentally',
      intensity: 'recovery',
      icon: '🧘',
      intervals: [],
    },
    {
      day: 'Sat',
      name: 'Race Simulation',
      duration: '1.5h',
      durationMin: 90,
      description: 'Final race pace test',
      intensity: 'threshold',
      icon: '🏁',
      intervals: [
        { startMin: 0, endMin: 20, powerPercent: 60, label: 'Warmup' },
        { startMin: 20, endMin: 50, powerPercent: 95, label: 'Race Pace' },
        { startMin: 50, endMin: 90, powerPercent: 50, label: 'Cooldown' },
      ],
    },
    {
      day: 'Sun',
      name: 'Easy Spin',
      duration: '45min',
      durationMin: 45,
      description: 'Very easy, stay fresh',
      intensity: 'recovery',
      icon: '☀️',
      intervals: [{ startMin: 0, endMin: 45, powerPercent: 50, label: 'Recovery' }],
    },
  ],
  taper: [
    {
      day: 'Mon',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Complete rest',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Tue',
      name: 'Openers',
      duration: '45min',
      durationMin: 45,
      description: '3x1min hard, keep legs fresh',
      intensity: 'tempo',
      icon: '⚡',
      intervals: [
        { startMin: 0, endMin: 15, powerPercent: 55, label: 'Warmup' },
        { startMin: 15, endMin: 16, powerPercent: 110, label: 'Opener 1' },
        { startMin: 16, endMin: 21, powerPercent: 50, label: 'Rest' },
        { startMin: 21, endMin: 22, powerPercent: 110, label: 'Opener 2' },
        { startMin: 22, endMin: 27, powerPercent: 50, label: 'Rest' },
        { startMin: 27, endMin: 28, powerPercent: 110, label: 'Opener 3' },
        { startMin: 28, endMin: 45, powerPercent: 50, label: 'Cooldown' },
      ],
    },
    {
      day: 'Wed',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Rest, hydrate, eat well',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Thu',
      name: 'Light Spin',
      duration: '30min',
      durationMin: 30,
      description: 'Very easy, just spin the legs',
      intensity: 'recovery',
      icon: '🔄',
      intervals: [{ startMin: 0, endMin: 30, powerPercent: 45, label: 'Light Spin' }],
    },
    {
      day: 'Fri',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Rest, prep gear, early sleep',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Sat',
      name: '🏆 RACE DAY',
      duration: 'Race',
      durationMin: 60,
      description: 'Give it everything!',
      intensity: 'threshold',
      icon: '🏆',
      intervals: [{ startMin: 0, endMin: 60, powerPercent: 100, label: 'RACE!' }],
    },
    {
      day: 'Sun',
      name: 'Recovery',
      duration: '1h',
      durationMin: 60,
      description: 'Easy spin, celebrate!',
      intensity: 'recovery',
      icon: '🎉',
      intervals: [{ startMin: 0, endMin: 60, powerPercent: 45, label: 'Celebration' }],
    },
  ],
  maintenance: [
    {
      day: 'Mon',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Complete rest or light stretching',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Tue',
      name: 'Zone 2 Ride',
      duration: '1h',
      durationMin: 60,
      description: 'Zone 2, steady aerobic maintenance',
      intensity: 'endurance',
      icon: '🚴',
      intervals: [{ startMin: 0, endMin: 60, powerPercent: 65, label: 'Zone 2' }],
    },
    {
      day: 'Wed',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Rest',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Thu',
      name: 'Easy Spin',
      duration: '45min',
      durationMin: 45,
      description: 'Easy pace, high cadence',
      intensity: 'recovery',
      icon: '🔄',
      intervals: [{ startMin: 0, endMin: 45, powerPercent: 55, label: 'Easy' }],
    },
    {
      day: 'Fri',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Rest',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Sat',
      name: 'Long Zone 2',
      duration: '2h',
      durationMin: 120,
      description: 'Long Zone 2 ride, maintain aerobic base',
      intensity: 'endurance',
      icon: '🏔️',
      intervals: [{ startMin: 0, endMin: 120, powerPercent: 63, label: 'Zone 2' }],
    },
    {
      day: 'Sun',
      name: 'Recovery Spin',
      duration: '45min',
      durationMin: 45,
      description: 'Very easy recovery',
      intensity: 'recovery',
      icon: '☀️',
      intervals: [{ startMin: 0, endMin: 45, powerPercent: 50, label: 'Recovery' }],
    },
  ],
  custom: [
    {
      day: 'Mon',
      name: 'Rest',
      duration: '-',
      durationMin: 0,
      description: 'Rest',
      intensity: 'recovery',
      icon: '😴',
      intervals: [],
    },
    {
      day: 'Sat',
      name: 'Endurance Ride',
      duration: '1.5h',
      durationMin: 90,
      description: 'Zone 2 endurance ride',
      intensity: 'endurance',
      icon: '🚴',
      intervals: [{ startMin: 0, endMin: 90, powerPercent: 65, label: 'Endurance' }],
    },
  ],
};

export const PHASE_TEMPLATES: Record<PhaseName, Omit<TrainingPhase, 'weekCount'>> = {
  base: {
    name: 'Base',
    description: 'Build aerobic foundation with long, steady rides',
    intensity: 'low',
    focus: 'Endurance & Zone 2',
    color: '#4CAF50',
    weeklyWorkouts: WORKOUT_TEMPLATES.base,
  },
  build1: {
    name: 'Build 1',
    description: 'Introduce tempo and threshold work',
    intensity: 'medium',
    focus: 'Sweet Spot & Tempo',
    color: '#FF9800',
    weeklyWorkouts: WORKOUT_TEMPLATES.build1,
  },
  build2: {
    name: 'Build 2',
    description: 'Race-specific intensity intervals',
    intensity: 'high',
    focus: 'VO2max & Threshold',
    color: '#f44336',
    weeklyWorkouts: WORKOUT_TEMPLATES.build2,
  },
  peak: {
    name: 'Peak',
    description: 'Sharpen fitness with high intensity, low volume',
    intensity: 'high',
    focus: 'Race Simulation',
    color: '#9C27B0',
    weeklyWorkouts: WORKOUT_TEMPLATES.peak,
  },
  taper: {
    name: 'Taper',
    description: 'Reduce volume, maintain intensity, rest up',
    intensity: 'recovery',
    focus: 'Recovery & Freshness',
    color: '#2196F3',
    weeklyWorkouts: WORKOUT_TEMPLATES.taper,
  },
  maintenance: {
    name: 'Maintenance',
    description: 'Maintain aerobic fitness with moderate Zone 2 volume',
    intensity: 'low',
    focus: 'Zone 2 & Recovery',
    color: '#009688',
    weeklyWorkouts: WORKOUT_TEMPLATES.maintenance,
  },
  custom: {
    name: 'Custom',
    description: 'Coach-defined custom phase',
    intensity: 'medium',
    focus: 'Custom',
    color: '#9E9E9E',
    weeklyWorkouts: WORKOUT_TEMPLATES.custom,
  },
};

export function generateTrainingPlan(targetDate: Date): TrainingPlan {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const totalWeeks = Math.max(1, Math.floor((target.getTime() - today.getTime()) / msPerWeek));

  const phases: TrainingPhase[] = [];

  if (totalWeeks >= 12) {
    const baseWeeks = Math.floor(totalWeeks * 0.35);
    const build1Weeks = Math.floor(totalWeeks * 0.25);
    const build2Weeks = Math.floor(totalWeeks * 0.2);
    const peakWeeks = Math.floor(totalWeeks * 0.1);
    const taperWeeks = Math.max(1, totalWeeks - baseWeeks - build1Weeks - build2Weeks - peakWeeks);

    phases.push({ ...PHASE_TEMPLATES.base, weekCount: baseWeeks });
    phases.push({ ...PHASE_TEMPLATES.build1, weekCount: build1Weeks });
    phases.push({ ...PHASE_TEMPLATES.build2, weekCount: build2Weeks });
    phases.push({ ...PHASE_TEMPLATES.peak, weekCount: peakWeeks });
    phases.push({ ...PHASE_TEMPLATES.taper, weekCount: taperWeeks });
  } else if (totalWeeks >= 6) {
    const baseWeeks = Math.floor(totalWeeks * 0.3);
    const buildWeeks = Math.floor(totalWeeks * 0.4);
    const peakWeeks = Math.floor(totalWeeks * 0.15);
    const taperWeeks = Math.max(1, totalWeeks - baseWeeks - buildWeeks - peakWeeks);

    phases.push({ ...PHASE_TEMPLATES.base, weekCount: baseWeeks });
    phases.push({ ...PHASE_TEMPLATES.build1, weekCount: buildWeeks });
    phases.push({ ...PHASE_TEMPLATES.peak, weekCount: peakWeeks });
    phases.push({ ...PHASE_TEMPLATES.taper, weekCount: taperWeeks });
  } else {
    const maintainWeeks = Math.max(1, totalWeeks - 1);
    const taperWeeks = 1;

    phases.push({
      ...PHASE_TEMPLATES.build1,
      weekCount: maintainWeeks,
      name: 'Maintain',
      description: 'Maintain current fitness',
    });
    phases.push({ ...PHASE_TEMPLATES.taper, weekCount: taperWeeks });
  }

  const weeklySchedule: WeekSchedule[] = [];
  const currentDate = new Date(today);
  let weekNumber = 1;

  for (const phase of phases) {
    for (let i = 0; i < phase.weekCount; i++) {
      const startDate = new Date(currentDate);
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + 6);

      weeklySchedule.push({
        weekNumber,
        startDate,
        endDate,
        phase,
      });

      currentDate.setDate(currentDate.getDate() + 7);
      weekNumber++;
    }
  }

  return { targetDate: target, totalWeeks, phases, weeklySchedule };
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

export function getIntensityColor(intensity: Workout['intensity']): string {
  const colors: Record<Workout['intensity'], string> = {
    recovery: '#4CAF50',
    endurance: '#8BC34A',
    tempo: '#FF9800',
    threshold: '#f44336',
    vo2max: '#9C27B0',
    sprint: '#E91E63',
  };
  return colors[intensity];
}

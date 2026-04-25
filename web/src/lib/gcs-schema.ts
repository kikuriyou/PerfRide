export type CoachAutonomy = 'observe' | 'suggest' | 'coach';
export type PhaseName =
  | 'base'
  | 'build1'
  | 'build2'
  | 'peak'
  | 'taper'
  | 'maintenance'
  | 'custom';
export type DayName = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const KNOWN_PHASE_NAMES: readonly PhaseName[] = [
  'base',
  'build1',
  'build2',
  'peak',
  'taper',
  'maintenance',
  'custom',
];

export function resolvePhaseName(raw: string): PhaseName {
  return KNOWN_PHASE_NAMES.includes(raw as PhaseName) ? (raw as PhaseName) : 'custom';
}
export type SessionStatus =
  | 'planned'
  | 'registered'
  | 'confirmed'
  | 'completed'
  | 'skipped'
  | 'modified';
export type SessionOrigin = 'baseline' | 'appended';
export type WeekStatus = 'draft' | 'pending' | 'modified' | 'approved' | 'applied';
export type ReviewStatus = 'pending' | 'modified' | 'approved' | 'applied' | 'dismissed' | 'error';

export interface WeeklyScheduleDay {
  available: boolean;
  max_minutes?: number;
  time_slot?: string;
}

export type WeeklySchedule = Record<DayName, WeeklyScheduleDay>;

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  mon: { available: true, max_minutes: 60 },
  tue: { available: true, max_minutes: 75 },
  wed: { available: true, max_minutes: 60 },
  thu: { available: true, max_minutes: 75 },
  fri: { available: true, max_minutes: 60 },
  sat: { available: true, max_minutes: 180 },
  sun: { available: true, max_minutes: 180 },
};

export interface GCSUserSettings {
  user_id: string;
  strava_owner_id: number;
  coach_autonomy?: CoachAutonomy;
  ftp: number;
  weight_kg: number;
  max_hr: number;
  goal: {
    type: string;
    name: string;
    date: string | null;
    priority: string;
  };
  training_preference: {
    mode: 'indoor_preferred' | 'outdoor_possible' | 'outdoor_preferred';
    location: { lat: number; lon: number };
    weekly_schedule: Partial<WeeklySchedule>;
  };
  strava_auth: {
    refresh_token: string;
    access_token: string;
    expires_at: number;
  };
  notification: {
    channels: ('web_push' | 'line')[];
    web_push_subscription?: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    line_user_id?: string;
  };
  zwift_id: string;
  updated_at: string;
}

export interface TrainingSession {
  date: string;
  type: string;
  duration_minutes?: number;
  target_tss?: number;
  planned_tss?: number;
  status: SessionStatus;
  origin?: SessionOrigin;
  actual_tss?: number;
  workout_id?: string;
  updated_by?: string;
  updated_at?: string;
  notes?: string;
}

export interface ApprovedWeekPayload {
  week_start: string;
  week_number: number;
  phase: PhaseName;
  target_tss: number;
  plan_revision: number;
  status: WeekStatus;
  summary?: string;
  sessions: TrainingSession[];
  updated_at: string;
  updated_by: string;
}

export interface GCSTrainingPlan {
  user_id: string;
  plan_id: string;
  goal_event: string;
  current_phase: string;
  phases: { name: PhaseName; start: string; end: string }[];
  weekly_plan: Record<string, ApprovedWeekPayload>;
  updated_at: string;
  updated_by: string;
}

export interface WeeklyReviewMetadata {
  kind: string;
  review_id: string;
  week_start: string;
  plan_revision: number;
  respond_path: string;
}

export interface WeeklyPlanReviewPayload {
  review_id: string;
  week_start: string;
  plan_revision: number;
  status: ReviewStatus;
  draft: ApprovedWeekPayload;
  session_id?: string | null;
  user_message?: string | null;
  created_at: string;
  notified_at?: string | null;
  approved_at?: string | null;
  applied_at?: string | null;
  dismissed_at?: string | null;
  error_message?: string | null;
  notification_metadata?: WeeklyReviewMetadata;
}

export interface WeeklyPlanReviewStore {
  reviews: Record<string, WeeklyPlanReviewPayload>;
  updated_at: string;
}

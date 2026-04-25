import type {
  ApprovedWeekPayload,
  CoachAutonomy,
  GCSTrainingPlan,
  TrainingSession,
  WeeklyPlanReviewStore,
} from '@/lib/gcs-schema';

export interface CurrentPlanContext {
  source: 'approved' | 'pending' | 'suggest';
  weekStart: string | null;
  planRevision: number | null;
  planStatus: string;
  week: ApprovedWeekPayload | null;
  todaySession: TrainingSession | null;
  planContextKey: string | null;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function mondayOfWeek(referenceDate: Date): string {
  const copy = new Date(referenceDate);
  const day = copy.getUTCDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  copy.setUTCDate(copy.getUTCDate() - daysToMonday);
  return isoDate(copy);
}

export function buildPlanContextKey(
  coachAutonomy: CoachAutonomy,
  weekStart: string,
  planRevision: number,
  planStatus: string,
): string {
  return `${coachAutonomy}:${weekStart}:${planRevision}:${planStatus}`;
}

function sessionForDate(week: ApprovedWeekPayload, targetDate: string): TrainingSession | null {
  return week.sessions.find((session) => session.date === targetDate) ?? null;
}

function approvedWeekForDate(
  trainingPlan: GCSTrainingPlan | null,
  targetDate: string,
): ApprovedWeekPayload | null {
  if (!trainingPlan) return null;
  return (
    Object.values(trainingPlan.weekly_plan).find((week) =>
      week.sessions.some((session) => session.date === targetDate),
    ) ?? null
  );
}

function pendingWeekForStart(
  reviewStore: WeeklyPlanReviewStore | null,
  weekStart: string,
): ApprovedWeekPayload | null {
  if (!reviewStore) return null;
  const review = reviewStore.reviews[`weekly_${weekStart}`];
  if (!review) return null;
  if (review.status !== 'pending' && review.status !== 'modified') return null;
  return review.draft;
}

export function getCurrentPlanContext(
  coachAutonomy: CoachAutonomy,
  trainingPlan: GCSTrainingPlan | null,
  reviewStore: WeeklyPlanReviewStore | null,
  referenceDate: Date,
): CurrentPlanContext {
  if (coachAutonomy !== 'coach') {
    return {
      source: 'suggest',
      weekStart: null,
      planRevision: null,
      planStatus: 'suggest',
      week: null,
      todaySession: null,
      planContextKey: null,
    };
  }

  const targetDate = isoDate(referenceDate);
  const weekStart = mondayOfWeek(referenceDate);
  const approvedWeek = approvedWeekForDate(trainingPlan, targetDate);
  if (approvedWeek) {
    return {
      source: 'approved',
      weekStart: approvedWeek.week_start,
      planRevision: approvedWeek.plan_revision,
      planStatus: approvedWeek.status,
      week: approvedWeek,
      todaySession: sessionForDate(approvedWeek, targetDate),
      planContextKey: buildPlanContextKey(
        coachAutonomy,
        approvedWeek.week_start,
        approvedWeek.plan_revision,
        approvedWeek.status,
      ),
    };
  }

  const pendingWeek = pendingWeekForStart(reviewStore, weekStart);
  if (pendingWeek) {
    return {
      source: 'pending',
      weekStart: pendingWeek.week_start,
      planRevision: pendingWeek.plan_revision,
      planStatus: pendingWeek.status,
      week: pendingWeek,
      todaySession: sessionForDate(pendingWeek, targetDate),
      planContextKey: buildPlanContextKey(
        coachAutonomy,
        pendingWeek.week_start,
        pendingWeek.plan_revision,
        pendingWeek.status,
      ),
    };
  }

  return {
    source: 'suggest',
    weekStart: null,
    planRevision: null,
    planStatus: 'suggest',
    week: null,
    todaySession: null,
    planContextKey: null,
  };
}

import type {
  ApprovedWeekPayload,
  CoachAutonomy,
  GCSTrainingPlan,
  WeeklyPlanReviewStore,
} from '@/lib/gcs-schema';

export interface CurrentPlanContext {
  source: 'approved' | 'pending' | 'suggest';
  weekStart: string | null;
  planRevision: number | null;
  planStatus: string;
  week: ApprovedWeekPayload | null;
  planContextKey: string | null;
}

// All week-boundary math in this app is JST-based: agent generates plans on Monday JST,
// and users open the dashboard at JST hours where UTC would still be on the previous day.
const JST_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
});

interface JstParts {
  date: string; // YYYY-MM-DD
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekdayMon0: number; // 0=Mon ... 6=Sun
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function jstParts(reference: Date): JstParts {
  const parts = JST_PARTS_FORMATTER.formatToParts(reference);
  const lookup: Record<string, string> = {};
  for (const part of parts) lookup[part.type] = part.value;
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    year,
    month,
    day,
    weekdayMon0: WEEKDAY_INDEX[lookup.weekday] ?? 0,
  };
}

export function isoDate(date: Date): string {
  return jstParts(date).date;
}

export function mondayOfWeek(referenceDate: Date): string {
  const parts = jstParts(referenceDate);
  // Build a UTC midnight date for the JST calendar day, then walk back to Monday.
  const baseUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  baseUtc.setUTCDate(baseUtc.getUTCDate() - parts.weekdayMon0);
  return baseUtc.toISOString().slice(0, 10);
}

export function buildPlanContextKey(
  coachAutonomy: CoachAutonomy,
  weekStart: string,
  planRevision: number,
  planStatus: string,
): string {
  return `${coachAutonomy}:${weekStart}:${planRevision}:${planStatus}`;
}

function addIsoDays(dateString: string, days: number): string | null {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekCoversDate(week: ApprovedWeekPayload, targetDate: string): boolean {
  const weekEnd = addIsoDays(week.week_start, 6);
  if (weekEnd && week.week_start <= targetDate && targetDate <= weekEnd) {
    return true;
  }
  const sessionDates = week.sessions
    .map((session) => session.date)
    .filter((date): date is string => typeof date === 'string');
  if (sessionDates.includes(targetDate)) {
    return true;
  }
  if (sessionDates.length === 0) return false;
  const sortedDates = [...sessionDates].sort();
  return sortedDates[0] <= targetDate && targetDate <= sortedDates[sortedDates.length - 1];
}

export function approvedWeekForDate(
  trainingPlan: GCSTrainingPlan | null,
  targetDate: string,
): ApprovedWeekPayload | null {
  if (!trainingPlan) return null;
  return (
    Object.values(trainingPlan.weekly_plan).find((week) => weekCoversDate(week, targetDate)) ?? null
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
    planContextKey: null,
  };
}

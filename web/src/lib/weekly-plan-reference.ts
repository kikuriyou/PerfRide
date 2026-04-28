import { parseJstClock } from '@/app/dashboard/_lib/gcs';

export interface WeeklyPlanReference {
  reference: Date;
  asOf: string | null;
}

export function decodeAsOfCookie(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveWeeklyPlanReference(
  asOf: string | null | undefined,
  fallback = new Date(),
): WeeklyPlanReference {
  if (!asOf) return { reference: fallback, asOf: null };
  const parsed = parseJstClock(asOf);
  return { reference: parsed ?? fallback, asOf: parsed ? asOf : null };
}

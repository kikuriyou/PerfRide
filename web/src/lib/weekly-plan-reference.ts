import { parseJstClock } from '@/lib/jst-clock';

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

export function formatJstClockLabel(value: string): string {
  const decoded = decodeAsOfCookie(value) ?? value;
  const trimmed = decoded.trim();
  const withoutZone = trimmed.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, '');
  const match = withoutZone.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  return trimmed;
}

export function formatJstInstantLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatJstClockLabel(value);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

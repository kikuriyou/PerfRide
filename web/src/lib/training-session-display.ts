export interface SessionDisplayInput {
  date?: string | null;
  type?: string | null;
  duration_minutes?: number | null;
  target_tss?: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  endurance: 'Endurance',
  recovery: 'Recovery',
  rest: 'Rest',
  sweetspot: 'Sweetspot',
  threshold: 'Threshold',
  tempo: 'Tempo',
  vo2max: 'VO2 Max',
  anaerobic: 'Anaerobic',
  sprint: 'Sprint',
  long: 'Long Ride',
};

export function formatShortDate(date: string | null | undefined): string {
  if (!date) return '対象日';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return date;
  return `${Number(match[2])}/${Number(match[3])}`;
}

export function formatSessionType(type: string | null | undefined): string {
  if (!type) return 'Session';
  const normalized = type.trim().toLowerCase();
  return TYPE_LABELS[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function formatSessionDuration(session: SessionDisplayInput): string {
  if (session.type?.toLowerCase() === 'rest') return '休養';
  if (typeof session.duration_minutes === 'number' && session.duration_minutes > 0) {
    return `${session.duration_minutes}min`;
  }
  return '時間未定';
}

export function formatSessionBrief(session: SessionDisplayInput): string {
  if (session.type?.toLowerCase() === 'rest') return '休養';
  return `${formatSessionType(session.type)} ${formatSessionDuration(session)}`;
}

export function formatSessionWithTss(session: SessionDisplayInput): string {
  const brief = formatSessionBrief(session);
  return typeof session.target_tss === 'number' && session.target_tss > 0
    ? `${brief} · TSS ${session.target_tss}`
    : brief;
}

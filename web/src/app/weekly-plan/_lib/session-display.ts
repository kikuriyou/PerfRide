import type { SessionStatus } from '@/lib/gcs-schema';

export interface SessionTypeMeta {
  label: string;
  color: string;
}

// MVP: text labels + color tags only (no icons yet — see Risks in plan.md).
export const SESSION_TYPE_META: Record<string, SessionTypeMeta> = {
  rest: { label: 'Rest', color: '#9e9e9e' },
  recovery: { label: 'Recovery', color: '#4caf50' },
  endurance: { label: 'Endurance', color: '#2196f3' },
  sweetspot: { label: 'Sweet Spot', color: '#ff9800' },
  tempo: { label: 'Tempo', color: '#ff7043' },
  threshold: { label: 'Threshold', color: '#f44336' },
  vo2max: { label: 'VO2max', color: '#9c27b0' },
  race_simulation: { label: 'Race Sim', color: '#7b1fa2' },
  sprint: { label: 'Sprint', color: '#e91e63' },
};

export function sessionTypeMeta(type: string): SessionTypeMeta {
  return SESSION_TYPE_META[type] ?? { label: type, color: '#607d8b' };
}

export interface StatusBadgeMeta {
  label: string;
  background: string;
  color: string;
}

export const STATUS_BADGE_META: Record<SessionStatus, StatusBadgeMeta> = {
  planned: { label: 'Planned', background: 'rgba(33,150,243,0.12)', color: '#1976d2' },
  registered: { label: 'Registered', background: 'rgba(0,150,136,0.12)', color: '#00796b' },
  confirmed: { label: 'Confirmed', background: 'rgba(0,150,136,0.18)', color: '#00695c' },
  completed: { label: 'Completed', background: 'rgba(76,175,80,0.18)', color: '#2e7d32' },
  skipped: { label: 'Skipped', background: 'rgba(158,158,158,0.18)', color: '#616161' },
  modified: { label: 'Modified', background: 'rgba(255,152,0,0.18)', color: '#e65100' },
};

export function statusBadgeMeta(status: SessionStatus): StatusBadgeMeta {
  return STATUS_BADGE_META[status] ?? STATUS_BADGE_META.planned;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function buildWeekDays(weekStart: string): { date: string; label: string }[] {
  const start = new Date(`${weekStart}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + offset);
    return {
      date: day.toISOString().slice(0, 10),
      label: DAY_LABELS[offset],
    };
  });
}

export interface MinimalSession {
  date: string;
  origin?: 'baseline' | 'appended';
}

export function groupSessionsByDate<T extends MinimalSession>(sessions: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const session of sessions) {
    if (!map[session.date]) {
      map[session.date] = [];
    }
    map[session.date].push(session);
  }
  for (const date of Object.keys(map)) {
    map[date].sort((a, b) => {
      const aOrigin = a.origin ?? 'baseline';
      const bOrigin = b.origin ?? 'baseline';
      if (aOrigin === bOrigin) return 0;
      return aOrigin === 'baseline' ? -1 : 1;
    });
  }
  return map;
}

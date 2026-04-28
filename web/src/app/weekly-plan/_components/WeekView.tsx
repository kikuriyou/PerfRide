import type { ApprovedWeekPayload } from '@/lib/gcs-schema';
import { buildWeekDays, groupSessionsByDate } from '../_lib/session-display';
import { SessionCard } from './SessionCard';

interface WeekViewProps {
  week: ApprovedWeekPayload;
  today: string;
}

export function WeekView({ week, today }: WeekViewProps) {
  const days = buildWeekDays(week.week_start);
  const grouped = groupSessionsByDate(week.sessions);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
      }}
    >
      {days.map((day) => {
        const isToday = day.date === today;
        const sessions = grouped[day.date] ?? [];
        const hasWorkout = sessions.some((session) => session.type !== 'rest');
        const isQuiet = !hasWorkout;
        return (
          <div
            key={day.date}
            data-testid={`day-row-${day.date}`}
            data-today={isToday ? 'true' : 'false'}
            style={{
              border: '1px solid var(--border)',
              borderLeft: isToday ? '4px solid #009688' : '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: isQuiet ? '0.45rem 0.65rem' : '0.65rem',
              background: isToday ? 'rgba(0,150,136,0.06)' : 'var(--background)',
              opacity: isQuiet && !isToday ? 0.62 : 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: '0.8rem',
                fontSize: '0.8rem',
                opacity: 0.75,
                marginBottom: hasWorkout ? '0.45rem' : 0,
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {day.label} {day.date.slice(5)}
              </span>
              {isToday && <span style={{ color: '#009688', fontWeight: 600 }}>Today</span>}
              {isQuiet && <span>{sessions.length > 0 ? 'Rest' : 'No session'}</span>}
            </div>
            {hasWorkout && (
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                {sessions.map((session, index) => (
                  <SessionCard
                    key={session.session_id ?? `${session.date}-${session.origin ?? 'baseline'}-${index}`}
                    session={session}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

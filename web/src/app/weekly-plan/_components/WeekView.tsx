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
        display: 'grid',
        // Mon–Sun read top-to-bottom on phone, then flow into 2-3 columns on
        // tablet, and reach a single 7-column row only when there's enough
        // width for each session card to actually breathe (~210px each).
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '0.5rem',
      }}
    >
      {days.map((day) => {
        const isToday = day.date === today;
        const sessions = grouped[day.date] ?? [];
        return (
          <div
            key={day.date}
            data-testid={`day-column-${day.date}`}
            data-today={isToday ? 'true' : 'false'}
            style={{
              border: isToday
                ? '2px solid rgba(0,150,136,0.6)'
                : '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem',
              background: isToday ? 'rgba(0,150,136,0.06)' : 'var(--background)',
              minHeight: '8rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: '0.7rem',
                opacity: 0.75,
              }}
            >
              <span style={{ fontWeight: 600 }}>{day.label}</span>
              <span>{day.date.slice(5)}</span>
            </div>
            {sessions.length === 0 ? (
              <div style={{ fontSize: '0.72rem', opacity: 0.45, fontStyle: 'italic' }}>—</div>
            ) : (
              sessions.map((session, index) => (
                <SessionCard
                  key={`${session.date}-${session.origin ?? 'baseline'}-${index}`}
                  session={session}
                />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

import type { TrainingSession } from '@/lib/gcs-schema';
import { sessionTypeMeta, statusBadgeMeta } from '../_lib/session-display';

interface SessionCardProps {
  session: TrainingSession;
}

export function SessionCard({ session }: SessionCardProps) {
  const typeMeta = sessionTypeMeta(session.type);
  const statusMeta = statusBadgeMeta(session.status);
  const isAppended = session.origin === 'appended';

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${isAppended ? 'rgba(255,152,0,0.4)' : 'var(--border)'}`,
        borderLeft: `4px solid ${typeMeta.color}`,
        borderRadius: 'var(--radius-md)',
        padding: '0.5rem 0.6rem',
        fontSize: '0.78rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.4rem',
        }}
      >
        <span style={{ fontWeight: 600, color: typeMeta.color }}>{typeMeta.label}</span>
        <span
          style={{
            fontSize: '0.66rem',
            padding: '0.1rem 0.45rem',
            borderRadius: 'var(--radius-full)',
            background: statusMeta.background,
            color: statusMeta.color,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {statusMeta.label}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', opacity: 0.78 }}>
        {typeof session.duration_minutes === 'number' && session.duration_minutes > 0 && (
          <span>{session.duration_minutes}min</span>
        )}
        {typeof session.target_tss === 'number' && session.target_tss > 0 && (
          <span>TSS {session.target_tss}</span>
        )}
      </div>
      {isAppended && (
        <div style={{ fontSize: '0.62rem', color: '#e65100', fontWeight: 500 }}>+ added</div>
      )}
    </div>
  );
}

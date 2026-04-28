'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSettings } from '@/lib/settings';
import { plannedSessionCount, shouldRenderWeeklyPlanCard } from './weekly-plan-card-helpers';

interface TodaySession {
  session_id?: string;
  date: string;
  type: string;
  status: string;
  duration_minutes?: number;
  target_tss?: number;
  origin?: 'baseline' | 'appended';
}

interface CurrentWeek {
  week_start: string;
  phase: string;
  target_tss: number;
  plan_revision: number;
  status: string;
  updated_at?: string;
  sessions: { date: string; type: string; status: string }[];
}

interface PendingReview {
  review_id: string;
  week_start: string;
  plan_revision: number;
  status: string;
}

interface WeeklyPlanData {
  coach_autonomy: string;
  reference_date?: string;
  week_start?: string;
  as_of?: string | null;
  current_week: CurrentWeek | null;
  pending_review: PendingReview | null;
  today_sessions: TodaySession[];
}

export default function WeeklyPlanCard() {
  const { settings, isLoaded } = useSettings();
  const [data, setData] = useState<WeeklyPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const weeklyPlanHref = settings.asOf
    ? `/weekly-plan?asOf=${encodeURIComponent(settings.asOf)}`
    : '/weekly-plan';
  const weeklyPlanApiPath = settings.asOf
    ? `/api/weekly-plan?asOf=${encodeURIComponent(settings.asOf)}`
    : '/api/weekly-plan';

  useEffect(() => {
    if (!isLoaded) return;
    fetch(weeklyPlanApiPath)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isLoaded, weeklyPlanApiPath]);

  if (loading) {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(0,150,136,0.07), rgba(0,121,107,0.04))',
          border: '1px solid rgba(0,150,136,0.2)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
          opacity: 0.6,
          fontSize: '0.9rem',
        }}
      >
        📅 Loading weekly plan...
      </div>
    );
  }

  if (!shouldRenderWeeklyPlanCard(data)) {
    return null;
  }

  const { current_week, pending_review, today_sessions } = data!;
  const plannedCount = plannedSessionCount(current_week);
  const todayList = today_sessions ?? [];

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(0,150,136,0.07), rgba(0,121,107,0.04))',
        border: '1px solid rgba(0,150,136,0.25)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
          📅 This Week&apos;s Plan
        </h3>
        {current_week && (
          <span
            style={{
              background: '#009688',
              color: 'white',
              padding: '0.15rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.72rem',
              fontWeight: 600,
              textTransform: 'capitalize',
            }}
          >
            {current_week.phase}
          </span>
        )}
      </div>

      {current_week && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.45rem',
            marginBottom: '0.75rem',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              padding: '0.42rem 0.65rem',
              minWidth: '110px',
            }}
          >
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#009688' }}>
              {plannedCount}
            </span>{' '}
            <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>sessions</span>
          </div>
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              padding: '0.42rem 0.65rem',
              minWidth: '130px',
            }}
          >
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#009688' }}>
              {current_week.target_tss}
            </span>{' '}
            <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>target TSS</span>
          </div>
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              padding: '0.42rem 0.65rem',
              textTransform: 'capitalize',
              fontSize: '0.78rem',
              opacity: 0.85,
            }}
          >
            {current_week.phase}
          </div>
        </div>
      )}

      {current_week?.updated_at && (
        <div style={{ fontSize: '0.74rem', opacity: 0.62, marginBottom: '0.75rem' }}>
          Weekly Plan updated · revision {current_week.plan_revision}
          {data?.as_of ? ` · 確認日 ${data.reference_date}` : ''}
        </div>
      )}

      {todayList.length > 0 && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            marginBottom: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>
            {data?.as_of ? '確認日の予定' : 'Today'}
          </span>
          {todayList.map((session, idx) => (
            <div
              key={session.session_id ?? `${session.date}-${session.origin ?? 'baseline'}-${idx}`}
              style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}
            >
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{session.type}</span>
              {session.duration_minutes ? (
                <span style={{ opacity: 0.6, fontSize: '0.78rem' }}>
                  {session.duration_minutes}min
                </span>
              ) : null}
              {session.origin === 'appended' && (
                <span style={{ fontSize: '0.7rem', color: '#e65100', fontWeight: 500 }}>
                  + added
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {pending_review && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            background: 'rgba(255,152,0,0.1)',
            border: '1px solid rgba(255,152,0,0.3)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span>🔔</span>
          <span>承認待ちのプランがあります</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link
          href={weeklyPlanHref}
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: 'var(--radius-sm)',
            background: '#009688',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.82rem',
            textDecoration: 'none',
          }}
        >
          Open Weekly Plan
        </Link>
        {pending_review && (
          <Link
            href={weeklyPlanHref}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(255,152,0,0.5)',
              background: 'rgba(255,152,0,0.1)',
              color: 'var(--foreground)',
              fontSize: '0.82rem',
              textDecoration: 'none',
            }}
          >
            Review Draft
          </Link>
        )}
      </div>
    </div>
  );
}

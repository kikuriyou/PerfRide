'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useSettings } from '@/lib/settings';
import { formatSessionBrief } from '@/lib/training-session-display';
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

interface PlanWeek {
  week_start: string;
  phase: string;
  target_tss: number;
  plan_revision: number;
  status: string;
  sessions: TodaySession[];
}

interface WeeklyPlanData {
  coach_autonomy: string;
  current_week: PlanWeek | null;
  pending_review: unknown | null;
  today_sessions: TodaySession[];
}

function todaySummary(sessions: TodaySession[]): string {
  if (sessions.length === 0) return '今日は休養または予定なし';
  return sessions.map((session) => formatSessionBrief(session)).join(' / ');
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
    let cancelled = false;
    fetch(weeklyPlanApiPath, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WeeklyPlanData | null) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, weeklyPlanApiPath]);

  if (loading) {
    return (
      <div
        style={{
          border: '1px solid rgba(0,150,136,0.16)',
          borderRadius: 'var(--radius-md)',
          padding: '0.5rem 0.75rem',
          opacity: 0.65,
          fontSize: '0.8rem',
        }}
      >
        今週のプランを読み込み中...
      </div>
    );
  }

  if (!shouldRenderWeeklyPlanCard(data)) return null;

  const currentWeek = data!.current_week!;
  const plannedCount = plannedSessionCount(currentWeek);
  const todayText = todaySummary(data!.today_sessions ?? []);

  return (
    <div
      style={{
        border: '1px solid rgba(0,150,136,0.18)',
        borderRadius: 'var(--radius-md)',
        padding: '0.55rem 0.75rem',
        background: 'rgba(0,150,136,0.04)',
        fontSize: '0.82rem',
        lineHeight: 1.45,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <strong style={{ fontSize: '0.86rem' }}>今週のプラン</strong>
          <span style={separator}> · </span>
          <span style={{ opacity: 0.7, textTransform: 'capitalize' }}>{currentWeek.phase}</span>
          <span style={separator}> · </span>
          <strong>{plannedCount}</strong>
          <span style={{ opacity: 0.6, marginLeft: '0.2rem' }}>sessions</span>
          <span style={separator}> · </span>
          <strong>{currentWeek.target_tss}</strong>
          <span style={{ opacity: 0.6, marginLeft: '0.2rem' }}>TSS</span>
          <span style={separator}> · </span>
          <span style={{ opacity: 0.55, marginRight: '0.35rem' }}>今日</span>
          {todayText}
        </div>
        <Link
          href={weeklyPlanHref}
          style={{
            padding: '0.2rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            background: '#009688',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.74rem',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          見る
        </Link>
      </div>
    </div>
  );
}

const separator: CSSProperties = {
  opacity: 0.35,
};

'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useSettings } from '@/lib/settings';
import { logCoachEvent } from '@/lib/coach-events';
import dynamic from 'next/dynamic';
import WorkoutChart from '@/components/WorkoutChart';
import {
  CACHE_KEY,
  loadCachedRecommendation,
  saveCachedRecommendation,
  shouldReadCache,
  shouldWriteCache,
  type Recommendation,
} from './recommendCache';
import type { TrainingSession } from '@/lib/gcs-schema';
import {
  buildReplaceConflictMessage,
  buildReplacePreview,
  buildReplaceSuccessMessage,
  buildWebhookDiffLine,
  displaySourceLabel,
  proposedSessionHeading,
} from './recommendation-display';
import { formatSessionBrief } from '@/lib/training-session-display';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });

type GoalKey = 'hillclimb_tt' | 'road_race' | 'ftp_improvement' | 'fitness_maintenance' | 'other';
type Panel = 'detail' | 'alternatives' | 'duration';

const GOAL_LABELS: Record<GoalKey, string> = {
  hillclimb_tt: '🏔️ レース準備（ヒルクライム / TT）',
  road_race: '🏁 レース準備（ロードレース）',
  ftp_improvement: '⚡ FTP向上',
  fitness_maintenance: '💪 体力維持',
  other: '✏️ その他',
};

interface AlternativeOption {
  label: string;
  constraint: string;
}

interface DurationOption {
  label: string;
  minutes: number;
}

interface WeeklyPlanSnapshot {
  current_week: {
    week_start: string;
    plan_revision: number;
    sessions: TrainingSession[];
  } | null;
}

type ReplaceCandidate = TrainingSession & { session_id: string };

const ALTERNATIVE_OPTIONS: AlternativeOption[] = [
  { label: '軽め', constraint: '強度をひとつ下げた軽めのメニューに変更してください' },
  { label: '重め', constraint: 'もうひとつ強度を上げたメニューに変更してください' },
  {
    label: '完全休養',
    constraint: '今日は完全休養にしてください。ストレッチと休養のアドバイスをお願いします',
  },
];

const DURATION_OPTIONS: DurationOption[] = [
  { label: '30分版', minutes: 30 },
  { label: '45分版', minutes: 45 },
  { label: '90分版', minutes: 90 },
];

const chipStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '1rem',
  padding: '0.3rem 0.75rem',
  fontSize: '0.78rem',
  color: 'var(--foreground)',
  whiteSpace: 'nowrap',
};

interface DropdownChipProps {
  label: string;
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

function DropdownChip({
  label,
  active,
  onToggle,
  disabled,
  children,
  containerRef,
}: DropdownChipProps) {
  return (
    <div style={{ position: 'relative' }} ref={containerRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        disabled={disabled}
        aria-pressed={active}
        aria-haspopup="menu"
        aria-expanded={active}
        style={{
          ...chipStyle,
          opacity: disabled ? 0.5 : active ? 1 : 0.85,
          cursor: disabled ? 'not-allowed' : 'pointer',
          borderColor: active ? 'var(--primary)' : 'var(--border)',
        }}
      >
        {label} ▾
      </button>
      {active && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            bottom: '110%',
            left: 0,
            zIndex: 10,
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.35rem',
            minWidth: '160px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

function MenuItem({ onClick, disabled, children }: MenuItemProps) {
  return (
    <button
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        padding: '0.5rem 0.7rem',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.85rem',
        color: 'var(--foreground)',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

function RecommendCardInner() {
  const { settings, updateSettings, isLoaded } = useSettings();
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [originalRecommendation, setOriginalRecommendation] = useState<Recommendation | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanSnapshot | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string>('');
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const [planContextKey, setPlanContextKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [openPanels, setOpenPanels] = useState<Set<Panel>>(() => new Set());
  const [mounted, setMounted] = useState(false);
  const alternativesRef = useRef<HTMLDivElement | null>(null);
  const durationRef = useRef<HTMLDivElement | null>(null);

  const [editing, setEditing] = useState(false);
  const [editGoal, setEditGoal] = useState<GoalKey>(settings.goal);
  const [editGoalCustom, setEditGoalCustom] = useState(settings.goalCustom || '');

  const weeklyPlanPath = () =>
    settings.asOf
      ? `/api/weekly-plan?asOf=${encodeURIComponent(settings.asOf)}`
      : '/api/weekly-plan';

  const fetchRecommendation = async (
    forceRefresh = false,
    overrides?: { goal?: GoalKey; goalCustom?: string; constraint?: string },
  ) => {
    const asOf = settings.asOf ?? null;
    const hasConstraint = !!overrides?.constraint;
    const allowLocalCache = settings.coachAutonomy !== 'coach';
    if (allowLocalCache && shouldReadCache(asOf, forceRefresh, hasConstraint)) {
      const cached = loadCachedRecommendation(
        settings.recommendMode,
        settings.usePersonalData,
        settings.ftp,
        settings.coachAutonomy,
        planContextKey,
      );
      if (cached) {
        setRecommendation(cached);
        setPlanContextKey(cached.plan_context_key ?? null);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: overrides?.goal ?? settings.goal,
          ftp: settings.ftp,
          goalCustom: overrides?.goalCustom ?? settings.goalCustom,
          recommendMode: settings.recommendMode,
          usePersonalData: settings.usePersonalData,
          coachAutonomy: settings.coachAutonomy,
          constraint: overrides?.constraint ?? null,
          asOf,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        const errMsg = (data as { error?: string }).error || `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      const data: Recommendation = await res.json();
      setRecommendation(data);
      setPlanContextKey(data.plan_context_key ?? null);
      if (settings.coachAutonomy === 'coach') {
        fetch(weeklyPlanPath())
          .then((weeklyRes) => (weeklyRes.ok ? weeklyRes.json() : null))
          .then((snapshot: WeeklyPlanSnapshot | null) => {
            setWeeklyPlan(snapshot);
            const proposedDate = data.proposed_session?.session_date;
            const first = snapshot?.current_week?.sessions.find(
              (session) =>
                session.date === proposedDate && session.type !== 'rest' && session.session_id,
            );
            setReplaceTargetId(first?.session_id ?? '');
          })
          .catch(() => setWeeklyPlan(null));
      }
      if (allowLocalCache && shouldWriteCache(asOf, hasConstraint)) {
        saveCachedRecommendation(
          data,
          settings.recommendMode,
          settings.usePersonalData,
          settings.ftp,
          settings.coachAutonomy,
          data.plan_context_key ?? null,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const togglePanel = (next: Panel) => {
    setOpenPanels((prev) => {
      const copy = new Set(prev);
      if (copy.has(next)) {
        copy.delete(next);
      } else {
        copy.add(next);
      }
      return copy;
    });
  };

  const closePanel = (target: Panel) => {
    setOpenPanels((prev) => {
      if (!prev.has(target)) return prev;
      const copy = new Set(prev);
      copy.delete(target);
      return copy;
    });
  };

  const handleDetailClick = () => {
    logCoachEvent('chip_click', 'detail');
    if (!openPanels.has('detail')) logCoachEvent('recommend_detail');
    togglePanel('detail');
  };

  const applyConstraint = (constraint: string, eventLabel: string) => {
    logCoachEvent('chip_click', eventLabel);
    if (recommendation && !originalRecommendation) {
      setOriginalRecommendation(recommendation);
    }
    setOpenPanels(new Set());
    fetchRecommendation(true, { constraint });
  };

  const handleAlternativePick = (opt: AlternativeOption) => {
    applyConstraint(opt.constraint, `alt_${opt.label}`);
  };

  const handleDurationPick = (opt: DurationOption) => {
    applyConstraint(`時間を${opt.minutes}分に変更してください`, `duration_${opt.minutes}`);
  };

  const handleRevert = () => {
    if (originalRecommendation) {
      logCoachEvent('chip_revert');
      setRecommendation(originalRecommendation);
      setOriginalRecommendation(null);
      setOpenPanels(new Set());
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (settings.coachAutonomy === 'observe') return;
    fetchRecommendation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLoaded,
    settings.asOf,
    settings.coachAutonomy,
    settings.goal,
    settings.goalCustom,
    settings.recommendMode,
    settings.usePersonalData,
    settings.ftp,
  ]);

  useEffect(() => {
    const altOpen = openPanels.has('alternatives');
    const durOpen = openPanels.has('duration');
    if (!altOpen && !durOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (altOpen && !alternativesRef.current?.contains(target)) {
        closePanel('alternatives');
      }
      if (durOpen && !durationRef.current?.contains(target)) {
        closePanel('duration');
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePanel('alternatives');
        closePanel('duration');
      }
    };
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('keydown', handleEsc);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [openPanels]);

  if (!mounted || settings.coachAutonomy === 'observe') return null;

  const goalDisplayLabel =
    settings.goal === 'other' && settings.goalCustom
      ? `✏️ ${settings.goalCustom}`
      : GOAL_LABELS[settings.goal] || GOAL_LABELS.fitness_maintenance;

  const handleStartEdit = () => {
    setEditGoal(settings.goal);
    setEditGoalCustom(settings.goalCustom || '');
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveGoal = () => {
    updateSettings({ goal: editGoal, goalCustom: editGoalCustom });
    setEditing(false);
    localStorage.removeItem(CACHE_KEY);
    setOriginalRecommendation(null);
    fetchRecommendation(true, { goal: editGoal, goalCustom: editGoalCustom });
  };

  const currentDuration = recommendation?.totalDurationMin;
  const restStronglyRecommended =
    !!recommendation?.summary &&
    (recommendation.summary.includes('完全休養') ||
      recommendation.summary.toLowerCase().includes('rest day'));
  const maxPowerPercent =
    recommendation?.workout_intervals && recommendation.workout_intervals.length > 0
      ? Math.max(...recommendation.workout_intervals.map((i) => i.powerPercent))
      : null;
  const isLowIntensityRec = maxPowerPercent !== null && maxPowerPercent < 75;
  const alternativeOptions = ALTERNATIVE_OPTIONS.filter(
    (opt) => opt.label !== '完全休養' || isLowIntensityRec,
  );
  const proposed = recommendation?.proposed_session;
  const replaceCandidates =
    proposed?.session_date && weeklyPlan?.current_week
      ? weeklyPlan.current_week.sessions.filter(
          (session): session is ReplaceCandidate =>
            session.date === proposed.session_date &&
            session.type !== 'rest' &&
            !!session.session_id,
        )
      : [];
  const selectedReplaceSession =
    replaceCandidates.find((session) => session.session_id === replaceTargetId) ?? null;
  const replacePreview = buildReplacePreview(selectedReplaceSession, proposed);
  const sourceBadge = displaySourceLabel(recommendation?.source);
  const webhookDiffLine =
    recommendation?.source === 'webhook'
      ? buildWebhookDiffLine(selectedReplaceSession, proposed)
      : null;
  const canReplace =
    recommendation?.source === 'webhook' &&
    !!proposed &&
    !proposed.is_rest &&
    !!proposed.session_type &&
    !!selectedReplaceSession &&
    !!replaceTargetId;

  const replaceWeeklySession = async () => {
    if (!proposed || !weeklyPlan?.current_week || !replaceTargetId) return;
    setDecisionMessage(null);
    const res = await fetch('/api/weekly-plan/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_session_id: replaceTargetId,
        session_date: proposed.session_date,
        session_type: proposed.session_type,
        duration_minutes: proposed.duration_minutes ?? 0,
        target_tss: proposed.target_tss ?? 0,
        notes: proposed.notes ?? proposed.reason ?? undefined,
        workout_id: proposed.workout_id ?? undefined,
        status: proposed.registered ? 'registered' : 'planned',
        expected_plan_revision: weeklyPlan.current_week.plan_revision,
      }),
    });
    if (res.status === 409) {
      setDecisionMessage(buildReplaceConflictMessage(proposed));
      return;
    }
    if (!res.ok) {
      setDecisionMessage('置き換えに失敗しました。');
      return;
    }
    setDecisionMessage(buildReplaceSuccessMessage(proposed));
    const snapshot = await fetch(weeklyPlanPath()).then((weeklyRes) =>
      weeklyRes.ok ? weeklyRes.json() : null,
    );
    setWeeklyPlan(snapshot);
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.08), rgba(255, 193, 7, 0.05))',
        border: '1px solid rgba(255, 152, 0, 0.2)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          🏋️ 次のおすすめ
        </h3>
        {sourceBadge && (
          <span
            style={{
              marginLeft: 'auto',
              marginRight: '0.5rem',
              padding: '0.15rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              fontSize: '0.7rem',
              opacity: 0.75,
            }}
          >
            {sourceBadge}
          </span>
        )}
        {recommendation && !loading && (
          <button
            onClick={() => {
              logCoachEvent('recommend_refresh');
              setOriginalRecommendation(null);
              fetchRecommendation(true);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              opacity: 0.6,
              color: 'var(--foreground)',
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Refresh recommendation"
          >
            🔄
          </button>
        )}
      </div>

      {!editing ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.75rem',
            fontSize: '0.82rem',
            opacity: 0.7,
          }}
        >
          <span>🎯 {goalDisplayLabel}</span>
          <button
            onClick={handleStartEdit}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.75rem',
              color: 'var(--primary)',
              padding: '0.1rem 0.3rem',
              borderRadius: 'var(--radius-sm)',
              opacity: 0.8,
            }}
            title="目標を変更"
          >
            変更
          </button>
        </div>
      ) : (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.75rem',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            🎯 Training Goal
          </div>
          <select
            value={editGoal}
            onChange={(e) => setEditGoal(e.target.value as GoalKey)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '0.85rem',
              width: '100%',
            }}
          >
            <option value="hillclimb_tt">🏔️ レース準備（ヒルクライム / TT）</option>
            <option value="road_race">🏁 レース準備（ロードレース）</option>
            <option value="ftp_improvement">⚡ FTP向上</option>
            <option value="fitness_maintenance">💪 体力維持</option>
            <option value="other">✏️ その他（自由入力）</option>
          </select>
          {editGoal === 'other' && (
            <input
              type="text"
              value={editGoalCustom}
              onChange={(e) => setEditGoalCustom(e.target.value)}
              placeholder="例: トライアスロン準備、グラベルレース..."
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
                fontSize: '0.85rem',
                width: '100%',
              }}
            />
          )}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginTop: '0.5rem',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={handleCancelEdit}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.3rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.8rem',
                color: 'var(--foreground)',
              }}
            >
              キャンセル
            </button>
            <button
              onClick={handleSaveGoal}
              style={{
                background: 'var(--primary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '0.3rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.8rem',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              保存
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div
          style={{
            textAlign: 'center',
            padding: '1rem 0',
            opacity: 0.7,
            fontSize: '0.9rem',
          }}
        >
          <div style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>🚴‍♂️</div>
          Analyzing your training data...
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(244, 67, 54, 0.08)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            color: '#f44336',
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>⚠️</span>
          {error}
          <button
            onClick={() => fetchRecommendation(true)}
            style={{
              display: 'block',
              marginTop: '0.5rem',
              background: 'none',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.25rem 0.75rem',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: 'var(--foreground)',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {recommendation && !loading && !error && (
        <>
          <div
            onClick={() => {
              const next = !expanded;
              setExpanded(next);
              if (next) logCoachEvent('recommend_expand');
            }}
            style={{
              cursor: 'pointer',
              padding: '0.75rem 1rem',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              border: '1px solid var(--border)',
            }}
          >
            <div>{recommendation.summary}</div>
            {recommendation.why_now && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', opacity: 0.7 }}>
                {recommendation.why_now}
              </div>
            )}
            {webhookDiffLine && (
              <div
                style={{
                  marginTop: '0.45rem',
                  fontSize: '0.82rem',
                  opacity: 0.78,
                  color: 'var(--primary)',
                }}
              >
                {webhookDiffLine}
              </div>
            )}
            <div
              style={{
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                opacity: 0.5,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {process.env.NEXT_PUBLIC_ENV !== 'production' && (
                <span>
                  {recommendation.from_cache ? '📋 cached' : '✨ generated'}
                  {(() => {
                    const raw = recommendation.created_at;
                    const iso = /[Z+]/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z';
                    return ` · ${new Date(iso).toLocaleString('ja-JP', {
                      timeZone: 'Asia/Tokyo',
                      hour12: false,
                    })}`;
                  })()}
                </span>
              )}
              <span>{expanded ? '▲ 閉じる' : '▼ 詳しく見る'}</span>
            </div>
          </div>

          {recommendation.source === 'webhook' && proposed && (
            <div
              style={{
                marginTop: '0.65rem',
                padding: '0.65rem 0.75rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface)',
                fontSize: '0.82rem',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
                {proposedSessionHeading(proposed)}
              </div>
              {proposed.reason && (
                <div style={{ opacity: 0.72, marginBottom: '0.45rem' }}>{proposed.reason}</div>
              )}
              {decisionMessage && (
                <div style={{ marginBottom: '0.45rem', color: 'var(--primary)' }}>
                  {decisionMessage}
                </div>
              )}
              {!proposed.is_rest && (
                <>
                  {replacePreview ? (
                    <div
                      style={{
                        marginBottom: '0.5rem',
                        padding: '0.45rem 0.55rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255,152,0,0.08)',
                        border: '1px solid rgba(255,152,0,0.22)',
                        lineHeight: 1.5,
                      }}
                    >
                      {replacePreview}
                    </div>
                  ) : (
                    <div style={{ marginBottom: '0.5rem', opacity: 0.7 }}>
                      置き換え対象の weekly plan session が見つかりません。
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setDecisionMessage('Weekly Plan は変更しません。')}
                      style={chipStyle}
                    >
                      変更なし
                    </button>
                    {replaceCandidates.length > 1 && (
                      <select
                        value={replaceTargetId}
                        onChange={(e) => setReplaceTargetId(e.target.value)}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--background)',
                          color: 'var(--foreground)',
                          padding: '0.3rem 0.5rem',
                          fontSize: '0.78rem',
                        }}
                      >
                        {replaceCandidates.map((session) => (
                          <option key={session.session_id} value={session.session_id}>
                            {formatSessionBrief(session)}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      disabled={!canReplace}
                      onClick={replaceWeeklySession}
                      style={{
                        ...chipStyle,
                        borderColor: canReplace ? 'var(--primary)' : 'var(--border)',
                        opacity: canReplace ? 1 : 0.45,
                        cursor: canReplace ? 'pointer' : 'not-allowed',
                      }}
                    >
                      置き換える
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {expanded && (
            <>
              {recommendation.based_on && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '0.78rem',
                    opacity: 0.6,
                    padding: '0 0.25rem',
                  }}
                >
                  {recommendation.based_on}
                </div>
              )}

              {recommendation.workout_intervals && recommendation.workout_intervals.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <WorkoutChart
                    intervals={recommendation.workout_intervals}
                    totalDurationMin={recommendation.totalDurationMin || 60}
                    title={recommendation.workoutName || 'Workout'}
                    showZoneLegend={false}
                  />
                </div>
              )}

              <div
                style={{
                  marginTop: '0.75rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.4rem',
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDetailClick();
                  }}
                  disabled={loading}
                  aria-pressed={openPanels.has('detail')}
                  style={{
                    ...chipStyle,
                    opacity: loading ? 0.5 : openPanels.has('detail') ? 1 : 0.85,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    borderColor: openPanels.has('detail') ? 'var(--primary)' : 'var(--border)',
                  }}
                >
                  なぜこの提案？
                </button>

                <DropdownChip
                  label="別案を見る"
                  active={openPanels.has('alternatives')}
                  onToggle={() => togglePanel('alternatives')}
                  disabled={loading}
                  containerRef={alternativesRef}
                >
                  {alternativeOptions.map((opt) => (
                    <MenuItem
                      key={opt.label}
                      onClick={() => handleAlternativePick(opt)}
                      disabled={opt.label === '重め' && restStronglyRecommended}
                    >
                      {opt.label}
                    </MenuItem>
                  ))}
                </DropdownChip>

                <DropdownChip
                  label="時間変更"
                  active={openPanels.has('duration')}
                  onToggle={() => togglePanel('duration')}
                  disabled={loading}
                  containerRef={durationRef}
                >
                  {DURATION_OPTIONS.map((opt) => {
                    const isCurrent =
                      typeof currentDuration === 'number' &&
                      Math.abs(currentDuration - opt.minutes) <= 5;
                    return (
                      <MenuItem
                        key={opt.label}
                        onClick={() => handleDurationPick(opt)}
                        disabled={isCurrent || restStronglyRecommended}
                      >
                        {opt.label}
                      </MenuItem>
                    );
                  })}
                </DropdownChip>
              </div>

              {originalRecommendation && (
                <button
                  onClick={handleRevert}
                  style={{
                    marginTop: '0.5rem',
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.3rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    color: 'var(--primary)',
                    opacity: 0.8,
                  }}
                >
                  元の提案に戻す
                </button>
              )}

              {openPanels.has('detail') && (
                <div
                  className="recommend-detail-markdown"
                  style={{
                    marginTop: '0.75rem',
                    padding: '1rem',
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.9rem',
                    lineHeight: 1.7,
                    border: '1px solid var(--border)',
                  }}
                >
                  <ReactMarkdown>{recommendation.detail}</ReactMarkdown>
                </div>
              )}

              {openPanels.has('detail') &&
                recommendation.references &&
                recommendation.references.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.75rem 1rem',
                      background: 'var(--surface)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.8rem',
                      border: '1px solid var(--border)',
                      opacity: 0.8,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>📚 References</div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.8 }}>
                      {recommendation.references.map((ref, i) => (
                        <li key={i}>
                          {ref.url ? (
                            <a
                              href={ref.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--primary)' }}
                            >
                              {ref.title}
                            </a>
                          ) : (
                            <span>{ref.title}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function RecommendCard() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.08), rgba(255, 193, 7, 0.05))',
            border: '1px solid rgba(255, 152, 0, 0.2)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            textAlign: 'center',
            opacity: 0.6,
            fontSize: '0.9rem',
          }}
        >
          🏋️ Loading recommendation...
        </div>
      }
    >
      <RecommendCardInner />
    </Suspense>
  );
}

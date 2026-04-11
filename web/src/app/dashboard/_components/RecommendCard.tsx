'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSettings } from '@/lib/settings';
import type { RecommendMode } from '@/lib/settings';
import ReactMarkdown from 'react-markdown';
import WorkoutChart from '@/components/WorkoutChart';
import type { WorkoutInterval } from '@/types/workout';

interface Recommendation {
  summary: string;
  detail: string;
  created_at: string;
  from_cache: boolean;
  workout_intervals?: WorkoutInterval[];
  totalDurationMin?: number;
  workoutName?: string;
  references?: { title: string; url: string | null }[];
}

const CACHE_KEY = 'perfride_recommendation_cache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

type GoalKey = 'hillclimb_tt' | 'road_race' | 'ftp_improvement' | 'fitness_maintenance' | 'other';

const GOAL_LABELS: Record<GoalKey, string> = {
  hillclimb_tt: '🏔️ レース準備（ヒルクライム / TT）',
  road_race: '🏁 レース準備（ロードレース）',
  ftp_improvement: '⚡ FTP向上',
  fitness_maintenance: '💪 体力維持',
  other: '✏️ その他',
};

function loadCachedRecommendation(
  recommendMode: RecommendMode,
  usePersonalData: boolean,
): Recommendation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const age = Date.now() - (cached._cachedAt || 0);
    if (age > CACHE_TTL_MS) return null;
    if (cached._recommendMode !== recommendMode || cached._usePersonalData !== usePersonalData) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function saveCachedRecommendation(
  rec: Recommendation,
  recommendMode: RecommendMode,
  usePersonalData: boolean,
): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        ...rec,
        _cachedAt: Date.now(),
        _recommendMode: recommendMode,
        _usePersonalData: usePersonalData,
      }),
    );
  } catch {
    // localStorage full or unavailable
  }
}

function RecommendCardInner() {
  const { settings, updateSettings } = useSettings();
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Inline goal editing state
  const [editing, setEditing] = useState(false);
  const [editGoal, setEditGoal] = useState<GoalKey>(settings.goal);
  const [editGoalCustom, setEditGoalCustom] = useState(settings.goalCustom || '');

  const fetchRecommendation = async (
    forceRefresh = false,
    overrides?: { goal?: GoalKey; goalCustom?: string },
  ) => {
    if (!forceRefresh) {
      const cached = loadCachedRecommendation(settings.recommendMode, settings.usePersonalData);
      if (cached) {
        setRecommendation(cached);
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
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setRecommendation(data);
      saveCachedRecommendation(data, settings.recommendMode, settings.usePersonalData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    // Load from cache or fetch on client mount
    fetchRecommendation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show nothing during SSR to avoid hydration mismatch
  if (!mounted) return null;

  // Resolve display label for current goal
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
    // Clear cache and re-fetch with new goal, passing overrides directly
    // because React state (settings) won't be updated yet
    localStorage.removeItem(CACHE_KEY);
    fetchRecommendation(true, { goal: editGoal, goalCustom: editGoalCustom });
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.08), rgba(255, 193, 7, 0.05))',
        border: '1px solid rgba(255, 152, 0, 0.2)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
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
          🏋️ Today&apos;s Recommendation
        </h3>
        {recommendation && !loading && (
          <button
            onClick={() => fetchRecommendation(true)}
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

      {/* Goal sub-header / inline editor */}
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

      {/* Loading state */}
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

      {/* Error state */}
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

      {/* Recommendation content */}
      {recommendation && !loading && !error && (
        <>
          {/* Summary (always visible) */}
          <div
            onClick={() => setExpanded(!expanded)}
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
                    return ` · ${new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false })}`;
                  })()}
                </span>
              )}
              <span>{expanded ? '▲ 閉じる' : '▼ 詳細を見る'}</span>
            </div>
          </div>

          {/* Workout Chart (visual) */}
          {expanded &&
            recommendation.workout_intervals &&
            recommendation.workout_intervals.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <WorkoutChart
                  intervals={recommendation.workout_intervals}
                  totalDurationMin={recommendation.totalDurationMin || 60}
                  title={recommendation.workoutName || 'Workout'}
                  showZoneLegend={false}
                />
              </div>
            )}

          {/* Detail (expandable, markdown rendered) */}
          {expanded && (
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

          {/* References */}
          {expanded &&
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
                <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
                  📚 References
                </div>
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

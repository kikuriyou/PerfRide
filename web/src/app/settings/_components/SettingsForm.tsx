'use client';

import { useEffect, useState } from 'react';

import NotificationSettings from '@/app/dashboard/_components/NotificationSettings';
import type { DayName, WeeklySchedule } from '@/lib/gcs-schema';
import { useSettings } from '@/lib/settings';
import type { CoachAutonomy, RecommendMode } from '@/lib/settings';

const DAY_LABELS: Record<DayName, string> = {
  mon: '月',
  tue: '火',
  wed: '水',
  thu: '木',
  fri: '金',
  sat: '土',
  sun: '日',
};

const DAY_NAMES: DayName[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const COACH_AUTONOMY_OPTIONS: { value: CoachAutonomy; label: string; description: string }[] = [
  {
    value: 'observe',
    label: 'データの変化だけ教えて',
    description: 'トレーニングデータの変化を通知します。ワークアウト提案は表示しません。',
  },
  {
    value: 'suggest',
    label: 'トレーニングも提案して',
    description: 'データ通知に加えて、今日のワークアウトを提案します。',
  },
  {
    value: 'coach',
    label: '週間プランまで任せたい',
    description: '毎週の draft plan を作成し、承認後に今週の計画へ反映します。',
  },
];

const RECOMMEND_MODE_OPTIONS: { value: RecommendMode; label: string; description: string }[] = [
  {
    value: 'hybrid',
    label: '🔬 ハイブリッド',
    description: '知識ファイル + Web検索で根拠のある推薦',
  },
  {
    value: 'web_only',
    label: '🌐 Web検索のみ',
    description: 'Web検索のみで最新情報を重視した推薦',
  },
  {
    value: 'no_grounding',
    label: '💭 AIの知識のみ',
    description: '外部情報を使わずAIモデルの知識で推薦',
  },
];

function normalizeAsOf(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T23:59`;
  }
  return trimmed;
}

function isValidGoalDate(value: string): boolean {
  return value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default function SettingsForm() {
  const { settings, updateSettings } = useSettings();
  const [localFtp, setLocalFtp] = useState(settings.ftp);
  const [localWeight, setLocalWeight] = useState(settings.weight);
  const [localMaxHR, setLocalMaxHR] = useState(settings.maxHR);
  const [localGoal, setLocalGoal] = useState(settings.goal);
  const [localGoalCustom, setLocalGoalCustom] = useState(settings.goalCustom);
  const [localGoalDate, setLocalGoalDate] = useState(settings.goalDate ?? '');
  const [localRecommendMode, setLocalRecommendMode] = useState<RecommendMode>(
    settings.recommendMode,
  );
  const [localUsePersonalData, setLocalUsePersonalData] = useState(settings.usePersonalData);
  const [localCoachAutonomy, setLocalCoachAutonomy] = useState<CoachAutonomy>(
    settings.coachAutonomy,
  );
  const [localWeeklySchedule, setLocalWeeklySchedule] = useState<WeeklySchedule>(
    settings.weeklySchedule,
  );
  const [localAsOf, setLocalAsOf] = useState<string>(settings.asOf ?? '');
  const [saved, setSaved] = useState(false);
  const [goalDateError, setGoalDateError] = useState<string | null>(null);
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    setLocalFtp(settings.ftp);
    setLocalWeight(settings.weight);
    setLocalMaxHR(settings.maxHR);
    setLocalGoal(settings.goal);
    setLocalGoalCustom(settings.goalCustom);
    setLocalGoalDate(settings.goalDate ?? '');
    setLocalRecommendMode(settings.recommendMode);
    setLocalUsePersonalData(settings.usePersonalData);
    setLocalCoachAutonomy(settings.coachAutonomy);
    setLocalWeeklySchedule(settings.weeklySchedule);
    setLocalAsOf(settings.asOf ?? '');
  }, [settings]);

  const handleSave = () => {
    if (!isValidGoalDate(localGoalDate)) {
      setGoalDateError('goal date は YYYY-MM-DD 形式で入力してください。');
      return;
    }
    setGoalDateError(null);
    updateSettings({
      ftp: localFtp,
      weight: localWeight,
      maxHR: localMaxHR,
      goal: localGoal,
      goalCustom: localGoalCustom,
      goalDate: localGoalDate || null,
      recommendMode: localRecommendMode,
      usePersonalData: localUsePersonalData,
      coachAutonomy: localCoachAutonomy,
      weeklySchedule: localWeeklySchedule,
      asOf: normalizeAsOf(localAsOf),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleResetAsOf = () => {
    setLocalAsOf('');
    updateSettings({ asOf: null });
  };

  const updateDay = (dayName: DayName, patch: Partial<WeeklySchedule[DayName]>) => {
    setLocalWeeklySchedule((prev) => ({
      ...prev,
      [dayName]: {
        ...prev[dayName],
        ...patch,
      },
    }));
  };

  const estimateAge = 220 - localMaxHR;

  const cardStyle = {
    background: 'var(--surface)',
    padding: '1.5rem',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border)',
  };

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>⚡ FTP</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="number"
            value={localFtp}
            onChange={(e) => setLocalFtp(Number(e.target.value))}
            min={100}
            max={500}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1.25rem',
              fontWeight: 700,
              width: '120px',
              textAlign: 'center',
            }}
          />
          <span style={{ fontSize: '1.1rem', opacity: 0.8 }}>watts</span>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>⚖️ Body Weight</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="number"
            value={localWeight}
            onChange={(e) => setLocalWeight(Number(e.target.value))}
            min={40}
            max={150}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1.25rem',
              fontWeight: 700,
              width: '120px',
              textAlign: 'center',
            }}
          />
          <span style={{ fontSize: '1.1rem', opacity: 0.8 }}>kg</span>
        </div>
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: 'var(--background)',
            borderRadius: 'var(--radius-md)',
            display: 'inline-block',
          }}
        >
          <span style={{ opacity: 0.7 }}>W/kg: </span>
          <strong style={{ color: 'var(--primary)' }}>
            {(localFtp / localWeight).toFixed(2)} W/kg
          </strong>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>❤️ Max Heart Rate</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="number"
            value={localMaxHR}
            onChange={(e) => setLocalMaxHR(Number(e.target.value))}
            min={140}
            max={220}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1.25rem',
              fontWeight: 700,
              width: '120px',
              textAlign: 'center',
            }}
          />
          <span style={{ fontSize: '1.1rem', opacity: 0.8 }}>bpm</span>
        </div>
        <div style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.6 }}>
          推定年齢: {estimateAge > 0 ? estimateAge : '?'}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🎯 Training Goal</h3>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <select
            value={localGoal}
            onChange={(e) => setLocalGoal(e.target.value as typeof localGoal)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1rem',
              width: '100%',
            }}
          >
            <option value="hillclimb_tt">🏔️ レース準備（ヒルクライム / TT）</option>
            <option value="road_race">🏁 レース準備（ロードレース）</option>
            <option value="ftp_improvement">⚡ FTP向上</option>
            <option value="fitness_maintenance">💪 体力維持</option>
            <option value="other">✏️ その他</option>
          </select>
          {localGoal === 'other' && (
            <input
              type="text"
              value={localGoalCustom}
              onChange={(e) => setLocalGoalCustom(e.target.value)}
              placeholder="例: トライアスロン準備"
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
                fontSize: '1rem',
              }}
            />
          )}
          <div>
            <label
              htmlFor="goalDate"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                opacity: 0.7,
                marginBottom: '0.5rem',
              }}
            >
              Goal Date
            </label>
            <input
              id="goalDate"
              type="date"
              value={localGoalDate}
              onChange={(e) => setLocalGoalDate(e.target.value)}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${goalDateError ? '#e74c3c' : 'var(--border)'}`,
                background: 'var(--background)',
                color: 'var(--foreground)',
                fontSize: '1rem',
              }}
            />
            {goalDateError && (
              <div style={{ marginTop: '0.5rem', color: '#e74c3c', fontSize: '0.8rem' }}>
                {goalDateError}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🧠 コーチの自律度</h3>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {COACH_AUTONOMY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                cursor: 'pointer',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${localCoachAutonomy === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                background:
                  localCoachAutonomy === opt.value
                    ? 'color-mix(in srgb, var(--primary) 8%, transparent)'
                    : 'transparent',
              }}
            >
              <input
                type="radio"
                name="coachAutonomy"
                value={opt.value}
                checked={localCoachAutonomy === opt.value}
                onChange={() => setLocalCoachAutonomy(opt.value)}
                style={{ marginTop: '0.2rem', accentColor: 'var(--primary)' }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>{opt.label}</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: '0.25rem' }}>
                  {opt.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>📅 Weekly Schedule</h3>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {DAY_NAMES.map((dayName) => (
            <div
              key={dayName}
              style={{
                display: 'grid',
                gridTemplateColumns: '72px 100px 1fr',
                gap: '0.75rem',
                alignItems: 'center',
              }}
            >
              <strong>{DAY_LABELS[dayName]}</strong>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={localWeeklySchedule[dayName].available}
                  onChange={(e) => updateDay(dayName, { available: e.target.checked })}
                />
                <span>available</span>
              </label>
              <input
                type="number"
                min={0}
                max={600}
                value={localWeeklySchedule[dayName].max_minutes ?? 0}
                onChange={(e) =>
                  updateDay(dayName, {
                    max_minutes: Number(e.target.value) || 0,
                  })
                }
                disabled={!localWeeklySchedule[dayName].available}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🤖 AI推薦モード</h3>
        <select
          value={localRecommendMode}
          onChange={(e) => setLocalRecommendMode(e.target.value as RecommendMode)}
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontSize: '1rem',
            width: '100%',
          }}
        >
          {RECOMMEND_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.6 }}>
          {RECOMMEND_MODE_OPTIONS.find((o) => o.value === localRecommendMode)?.description}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>📊 パーソナルデータ</h3>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          <input
            type="checkbox"
            checked={localUsePersonalData}
            onChange={(e) => setLocalUsePersonalData(e.target.checked)}
            style={{ width: '1.25rem', height: '1.25rem', accentColor: 'var(--primary)' }}
          />
          <span>{localUsePersonalData ? 'ON — Stravaデータを使用' : 'OFF — 汎用推薦'}</span>
        </label>
      </div>

      {isDev && (
        <div
          style={{
            ...cardStyle,
            border: '1px dashed var(--primary)',
            background: 'color-mix(in srgb, var(--primary) 4%, var(--surface))',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>🧪 確認時刻（開発用）</h3>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="datetime-local"
              value={localAsOf}
              onChange={(e) => setLocalAsOf(e.target.value)}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
                fontSize: '1rem',
              }}
            />
            <button
              onClick={handleResetAsOf}
              className="btn"
              style={{
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--foreground)',
              }}
            >
              リセット
            </button>
          </div>
          {settings.asOf && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.7 }}>
              現在の確認時刻: <strong>{settings.asOf.replace('T', ' ')} (JST)</strong>
            </div>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <NotificationSettings />
      </div>

      <button onClick={handleSave} className="btn btn-primary" style={{ justifySelf: 'start' }}>
        {saved ? '✓ Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

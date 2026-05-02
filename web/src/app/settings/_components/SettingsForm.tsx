'use client';

import { useEffect, useEffectEvent, useState } from 'react';

import NotificationSettings from '@/app/dashboard/_components/NotificationSettings';
import type { DayName, WeeklySchedule } from '@/lib/gcs-schema';
import { useSettings } from '@/lib/settings';
import type { CoachAutonomy, RecommendMode } from '@/lib/settings';
import { formatJstClockLabel } from '@/lib/weekly-plan-reference';
import AgentOperationLogPanel from './AgentOperationLogPanel';

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

interface MyWhooshStatus {
  configured: boolean;
  email: string;
  updated_at: string | null;
  encryption_ready?: boolean;
  verification?: {
    ok: boolean;
    status: 'verified' | 'failed' | 'missing' | 'skipped' | 'already_logged_in';
    message: string;
    checked_at: string;
  } | null;
}

interface IntervalsIcuStatus {
  configured: boolean;
  athlete_id: string;
  updated_at: string | null;
  encryption_ready?: boolean;
  verification?: {
    ok: boolean;
    status: 'verified' | 'failed' | 'missing' | 'skipped';
    message: string;
    checked_at: string;
  } | null;
}

export function myWhooshSaveMessage(data: MyWhooshStatus): string {
  const verification = data.verification;
  if (verification?.status === 'verified') {
    return '保存しました。MyWhoosh ログイン確認も成功しました。';
  }
  if (verification?.status === 'already_logged_in') {
    return `保存しましたが、MyWhoosh は別デバイスでログイン中のため確認できませんでした: ${verification.message}`;
  }
  if (verification?.status === 'failed' || verification?.status === 'missing') {
    return `保存しましたが、MyWhoosh ログイン確認に失敗しました: ${verification.message}`;
  }
  if (verification?.status === 'skipped') {
    return `保存しましたが、MyWhoosh ログイン確認は未実行です: ${verification.message}`;
  }
  return '保存しました';
}

export function myWhooshTestMessage(data: MyWhooshStatus): string {
  const verification = data.verification;
  if (verification?.status === 'verified') {
    return 'MyWhoosh ログイン確認に成功しました。';
  }
  if (verification?.status === 'already_logged_in') {
    return `MyWhoosh は別デバイスでログイン中のため確認できませんでした: ${verification.message}`;
  }
  if (verification?.status === 'failed' || verification?.status === 'missing') {
    return `MyWhoosh ログイン確認に失敗しました: ${verification.message}`;
  }
  if (verification?.status === 'skipped') {
    return `MyWhoosh ログイン確認は未実行です: ${verification.message}`;
  }
  return 'MyWhoosh ログイン確認を実行しました';
}

export function intervalsIcuSaveMessage(data: IntervalsIcuStatus): string {
  const verification = data.verification;
  if (verification?.status === 'verified') {
    return '保存しました。Intervals.icu 接続確認も成功しました。';
  }
  if (verification?.status === 'failed' || verification?.status === 'missing') {
    return `保存しましたが、Intervals.icu 接続確認に失敗しました: ${verification.message}`;
  }
  if (verification?.status === 'skipped') {
    return `保存しましたが、Intervals.icu 接続確認は未実行です: ${verification.message}`;
  }
  return '保存しました';
}

export function intervalsIcuTestMessage(data: IntervalsIcuStatus): string {
  const verification = data.verification;
  if (verification?.status === 'verified') {
    return 'Intervals.icu 接続確認に成功しました。MyWhoosh への反映には数分かかることがあります。';
  }
  if (verification?.status === 'failed' || verification?.status === 'missing') {
    return `Intervals.icu 接続確認に失敗しました: ${verification.message}`;
  }
  if (verification?.status === 'skipped') {
    return `Intervals.icu 接続確認は未実行です: ${verification.message}`;
  }
  return 'Intervals.icu 接続確認を実行しました';
}

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
  const [myWhooshEmail, setMyWhooshEmail] = useState('');
  const [myWhooshPassword, setMyWhooshPassword] = useState('');
  const [myWhooshConfigured, setMyWhooshConfigured] = useState(false);
  const [myWhooshEncryptionReady, setMyWhooshEncryptionReady] = useState(true);
  const [myWhooshMessage, setMyWhooshMessage] = useState<string | null>(null);
  const [intervalsIcuApiKey, setIntervalsIcuApiKey] = useState('');
  const [intervalsIcuAthleteId, setIntervalsIcuAthleteId] = useState('0');
  const [intervalsIcuConfigured, setIntervalsIcuConfigured] = useState(false);
  const [intervalsIcuEncryptionReady, setIntervalsIcuEncryptionReady] = useState(true);
  const [intervalsIcuMessage, setIntervalsIcuMessage] = useState<string | null>(null);
  const [agentLogRefreshSignal, setAgentLogRefreshSignal] = useState(0);
  const isDev = process.env.NODE_ENV === 'development';

  const syncLocalSettings = useEffectEvent(() => {
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
  });

  useEffect(() => {
    syncLocalSettings();
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/mywhoosh', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MyWhooshStatus | null) => {
        if (!data || cancelled) return;
        setMyWhooshEmail(data.email);
        setMyWhooshConfigured(data.configured);
        setMyWhooshEncryptionReady(data.encryption_ready ?? true);
        if (data.encryption_ready === false) {
          setMyWhooshMessage('KMS_KEY_NAME が未設定のため MyWhoosh 認証情報を保存できません。');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/intervals-icu', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: IntervalsIcuStatus | null) => {
        if (!data || cancelled) return;
        setIntervalsIcuAthleteId(data.athlete_id || '0');
        setIntervalsIcuConfigured(data.configured);
        setIntervalsIcuEncryptionReady(data.encryption_ready ?? true);
        if (data.encryption_ready === false) {
          setIntervalsIcuMessage(
            'KMS_KEY_NAME が未設定のため Intervals.icu API key を保存できません。',
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleSaveMyWhoosh = async () => {
    setMyWhooshMessage(null);
    const res = await fetch('/api/settings/mywhoosh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: myWhooshEmail, password: myWhooshPassword }),
    });
    const data = (await res.json().catch(() => null)) as MyWhooshStatus | { error?: string } | null;
    if (!res.ok) {
      setMyWhooshMessage(
        data && 'error' in data ? data.error || '保存できませんでした' : '保存できませんでした',
      );
      return;
    }
    if (data && 'configured' in data) {
      setMyWhooshConfigured(data.configured);
      setMyWhooshEmail(data.email);
    }
    setMyWhooshPassword('');
    setMyWhooshMessage(data && 'configured' in data ? myWhooshSaveMessage(data) : '保存しました');
    setAgentLogRefreshSignal((value) => value + 1);
  };

  const handleTestMyWhoosh = async () => {
    setMyWhooshMessage(null);
    const res = await fetch('/api/settings/mywhoosh', { method: 'PUT' });
    const data = (await res.json().catch(() => null)) as MyWhooshStatus | { error?: string } | null;
    if (!res.ok) {
      setMyWhooshMessage(
        data && 'error' in data ? data.error || '確認できませんでした' : '確認できませんでした',
      );
      return;
    }
    if (data && 'configured' in data) {
      setMyWhooshConfigured(data.configured);
      setMyWhooshEmail(data.email);
    }
    setMyWhooshMessage(data && 'configured' in data ? myWhooshTestMessage(data) : '確認しました');
    setAgentLogRefreshSignal((value) => value + 1);
  };

  const handleDeleteMyWhoosh = async () => {
    setMyWhooshMessage(null);
    const res = await fetch('/api/settings/mywhoosh', { method: 'DELETE' });
    if (!res.ok) {
      setMyWhooshMessage('削除できませんでした');
      return;
    }
    setMyWhooshConfigured(false);
    setMyWhooshPassword('');
    setMyWhooshMessage('連携を解除しました');
  };

  const handleSaveIntervalsIcu = async () => {
    setIntervalsIcuMessage(null);
    const res = await fetch('/api/settings/intervals-icu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: intervalsIcuApiKey,
        athlete_id: intervalsIcuAthleteId || '0',
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | IntervalsIcuStatus
      | { error?: string }
      | null;
    if (!res.ok) {
      setIntervalsIcuMessage(
        data && 'error' in data ? data.error || '保存できませんでした' : '保存できませんでした',
      );
      return;
    }
    if (data && 'configured' in data) {
      setIntervalsIcuConfigured(data.configured);
      setIntervalsIcuAthleteId(data.athlete_id || '0');
    }
    setIntervalsIcuApiKey('');
    setIntervalsIcuMessage(
      data && 'configured' in data ? intervalsIcuSaveMessage(data) : '保存しました',
    );
    setAgentLogRefreshSignal((value) => value + 1);
  };

  const handleTestIntervalsIcu = async () => {
    setIntervalsIcuMessage(null);
    const res = await fetch('/api/settings/intervals-icu', { method: 'PUT' });
    const data = (await res.json().catch(() => null)) as
      | IntervalsIcuStatus
      | { error?: string }
      | null;
    if (!res.ok) {
      setIntervalsIcuMessage(
        data && 'error' in data ? data.error || '確認できませんでした' : '確認できませんでした',
      );
      return;
    }
    if (data && 'configured' in data) {
      setIntervalsIcuConfigured(data.configured);
      setIntervalsIcuAthleteId(data.athlete_id || '0');
    }
    setIntervalsIcuMessage(
      data && 'configured' in data ? intervalsIcuTestMessage(data) : '確認しました',
    );
    setAgentLogRefreshSignal((value) => value + 1);
  };

  const handleDeleteIntervalsIcu = async () => {
    setIntervalsIcuMessage(null);
    const res = await fetch('/api/settings/intervals-icu', { method: 'DELETE' });
    if (!res.ok) {
      setIntervalsIcuMessage('削除できませんでした');
      return;
    }
    setIntervalsIcuConfigured(false);
    setIntervalsIcuApiKey('');
    setIntervalsIcuAthleteId('0');
    setIntervalsIcuMessage('連携を解除しました');
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
        <AgentOperationLogPanel refreshSignal={agentLogRefreshSignal} />
      </div>

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

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Intervals.icu</h3>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <input
            type="password"
            value={intervalsIcuApiKey}
            onChange={(e) => setIntervalsIcuApiKey(e.target.value)}
            placeholder={
              intervalsIcuConfigured ? '保存済み。変更時のみ入力' : 'Intervals.icu API key'
            }
            autoComplete="off"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1rem',
            }}
          />
          <input
            type="text"
            value={intervalsIcuAthleteId}
            onChange={(e) => setIntervalsIcuAthleteId(e.target.value)}
            placeholder="athlete id (default 0)"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1rem',
            }}
          />
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleSaveIntervalsIcu}
              className="btn btn-primary"
              disabled={!intervalsIcuApiKey || !intervalsIcuEncryptionReady}
            >
              Save Intervals.icu
            </button>
            <button
              type="button"
              onClick={handleTestIntervalsIcu}
              className="btn"
              disabled={!intervalsIcuConfigured}
              style={{
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--foreground)',
              }}
            >
              Test connection
            </button>
            <button
              type="button"
              onClick={handleDeleteIntervalsIcu}
              className="btn"
              disabled={!intervalsIcuConfigured}
              style={{
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--foreground)',
              }}
            >
              Disconnect
            </button>
          </div>
          <div style={{ fontSize: '0.85rem', opacity: 0.75, lineHeight: 1.6 }}>
            <a href="https://intervals.icu/settings" target="_blank" rel="noreferrer">
              Intervals.icu Settings
            </a>
            {
              ' > Developer Settings で API key を作成してください。PerfRide は暗号化保存し、planned workout の登録にだけ使います。'
            }
            <br />
            <a href="https://event.mywhoosh.com/user/profile" target="_blank" rel="noreferrer">
              MyWhoosh Profile
            </a>
            {' > Connections で Intervals.icu の Read Calendar を有効にしてください。'}
            <a
              href="https://mywhoosh.com/docs/partner-connections/"
              target="_blank"
              rel="noreferrer"
            >
              公式手順
            </a>
            {'も確認できます。MyWhoosh への反映には数分かかることがあります。'}
          </div>
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
            {intervalsIcuMessage ??
              (intervalsIcuConfigured ? 'Credential configured' : 'Credential not configured')}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Legacy MyWhoosh direct upload</h3>
        <div style={{ marginBottom: '1rem', fontSize: '0.85rem', opacity: 0.7 }}>
          Intervals.icu 経由が標準です。MyWhoosh 直登録は fallback として残しています。
        </div>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <input
            type="email"
            value={myWhooshEmail}
            onChange={(e) => setMyWhooshEmail(e.target.value)}
            placeholder="email@example.com"
            autoComplete="username"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1rem',
            }}
          />
          <input
            type="password"
            value={myWhooshPassword}
            onChange={(e) => setMyWhooshPassword(e.target.value)}
            placeholder={myWhooshConfigured ? '保存済み。変更時のみ入力' : 'password'}
            autoComplete="current-password"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1rem',
            }}
          />
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleSaveMyWhoosh}
              className="btn btn-primary"
              disabled={!myWhooshEmail || !myWhooshPassword || !myWhooshEncryptionReady}
            >
              Save MyWhoosh
            </button>
            <button
              type="button"
              onClick={handleTestMyWhoosh}
              className="btn"
              disabled={!myWhooshConfigured}
              style={{
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--foreground)',
              }}
            >
              Test connection
            </button>
            <button
              type="button"
              onClick={handleDeleteMyWhoosh}
              className="btn"
              disabled={!myWhooshConfigured}
              style={{
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--foreground)',
              }}
            >
              Disconnect
            </button>
          </div>
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
            {myWhooshMessage ??
              (myWhooshConfigured ? 'Credential configured' : 'Credential not configured')}
          </div>
        </div>
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
              現在の確認時刻: <strong>{formatJstClockLabel(settings.asOf)} (JST)</strong>
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

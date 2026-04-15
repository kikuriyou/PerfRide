'use client';

import { useSettings } from '@/lib/settings';
import type { RecommendMode, CoachAutonomy } from '@/lib/settings';
import { useState, useEffect } from 'react';

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
    description: '週単位のトレーニングプランを自動生成します（Phase 2で有効化予定）。',
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

export default function SettingsForm() {
  const { settings, updateSettings } = useSettings();
  const [localFtp, setLocalFtp] = useState(settings.ftp);
  const [localWeight, setLocalWeight] = useState(settings.weight);
  const [localMaxHR, setLocalMaxHR] = useState(settings.maxHR);
  const [localGoal, setLocalGoal] = useState(settings.goal);
  const [localGoalCustom, setLocalGoalCustom] = useState(settings.goalCustom || '');
  const [localRecommendMode, setLocalRecommendMode] = useState<RecommendMode>(
    settings.recommendMode,
  );
  const [localUsePersonalData, setLocalUsePersonalData] = useState(settings.usePersonalData);
  const [localCoachAutonomy, setLocalCoachAutonomy] = useState<CoachAutonomy>(
    settings.coachAutonomy,
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalFtp(settings.ftp);
    setLocalWeight(settings.weight);
    setLocalMaxHR(settings.maxHR);
    setLocalGoal(settings.goal);
    setLocalGoalCustom(settings.goalCustom || '');
    setLocalRecommendMode(settings.recommendMode);
    setLocalUsePersonalData(settings.usePersonalData);
    setLocalCoachAutonomy(settings.coachAutonomy);
  }, [settings]);

  const handleSave = () => {
    updateSettings({
      ftp: localFtp,
      weight: localWeight,
      maxHR: localMaxHR,
      goal: localGoal,
      goalCustom: localGoalCustom,
      recommendMode: localRecommendMode,
      usePersonalData: localUsePersonalData,
      coachAutonomy: localCoachAutonomy,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
      {/* FTP Setting */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>⚡ FTP (Functional Threshold Power)</h3>
        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '1rem' }}>
          Your 1-hour max sustainable power. Used to calculate workout power targets.
        </p>
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

        <div style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.6 }}>
          Reference: Beginner ~150W, Intermediate ~200-250W, Advanced ~300W+
        </div>
      </div>

      {/* Weight Setting */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>⚖️ Body Weight</h3>
        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '1rem' }}>
          Your body weight for W/kg calculations.
        </p>
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
          <span style={{ opacity: 0.7 }}>Your W/kg: </span>
          <strong style={{ color: 'var(--primary)' }}>
            {(localFtp / localWeight).toFixed(2)} W/kg
          </strong>
        </div>
      </div>

      {/* Max HR Setting */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>❤️ Max Heart Rate</h3>
        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '1rem' }}>
          Your maximum heart rate. Used to estimate target HR zones for workouts.
        </p>
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
          Tip: A common estimate is 220 - age (approx. age {estimateAge > 0 ? estimateAge : '?'})
        </div>
      </div>

      {/* Training Goal Setting */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🎯 Training Goal</h3>
        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '1rem' }}>
          Your primary training objective. Used to personalize workout recommendations.
        </p>
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
            maxWidth: '400px',
          }}
        >
          <option value="hillclimb_tt">🏔️ レース準備（ヒルクライム / TT）</option>
          <option value="road_race">🏁 レース準備（ロードレース）</option>
          <option value="ftp_improvement">⚡ FTP向上</option>
          <option value="fitness_maintenance">💪 体力維持</option>
          <option value="other">✏️ その他（自由入力）</option>
        </select>

        {localGoal === 'other' && (
          <div style={{ marginTop: '1rem' }}>
            <input
              type="text"
              value={localGoalCustom}
              onChange={(e) => setLocalGoalCustom(e.target.value)}
              placeholder="例: トライアスロン準備、グラベルレース..."
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
                fontSize: '1rem',
                width: '100%',
                maxWidth: '400px',
              }}
            />
          </div>
        )}
      </div>

      {/* Coach Autonomy Setting */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🧠 コーチの自律度</h3>
        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '1rem' }}>
          AIコーチがどこまで積極的に介入するかを選べます。
        </p>
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
                  localCoachAutonomy === opt.value ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <input
                type="radio"
                name="coachAutonomy"
                value={opt.value}
                checked={localCoachAutonomy === opt.value}
                onChange={() => setLocalCoachAutonomy(opt.value)}
                style={{
                  marginTop: '0.2rem',
                  accentColor: 'var(--primary)',
                  cursor: 'pointer',
                }}
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

      {/* Recommend Mode Setting */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🤖 AI推薦モード</h3>
        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '1rem' }}>
          トレーニング推薦の生成方法を選択します。グラウンディング（外部情報源の参照）の有無を切り替えられます。
        </p>
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
            maxWidth: '400px',
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

      {/* Personal Data Setting */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>📊 パーソナルデータ</h3>
        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '1rem' }}>
          Strava のアクティビティデータを使って個人に合った推薦を生成します。OFFにすると汎用的なサイクリング推薦になります。
        </p>
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
            style={{
              width: '1.25rem',
              height: '1.25rem',
              accentColor: 'var(--primary)',
              cursor: 'pointer',
            }}
          />
          <span>{localUsePersonalData ? 'ON — Stravaデータを使用' : 'OFF — 汎用推薦'}</span>
        </label>
      </div>

      {/* Save Button */}
      <button onClick={handleSave} className="btn btn-primary" style={{ justifySelf: 'start' }}>
        {saved ? '✓ Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

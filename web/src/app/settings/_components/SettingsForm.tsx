'use client';

import { useEffect, useEffectEvent, useState } from 'react';

import NotificationSettings from '@/app/dashboard/_components/NotificationSettings';
import type { DayName, WeeklySchedule } from '@/lib/gcs-schema';
import { useSettings } from '@/lib/settings';
import type { CoachAutonomy, RecommendMode, UserLocale } from '@/lib/settings';
import { formatJstClockLabel } from '@/lib/weekly-plan-reference';
import AgentOperationLogPanel from './AgentOperationLogPanel';

const DAY_LABELS: Record<DayName, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const DAY_NAMES: DayName[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const INTERVALS_ICU_ATHLETE_ID = '0';

const COACH_AUTONOMY_OPTIONS: { value: CoachAutonomy; label: string; description: string }[] = [
  {
    value: 'observe',
    label: 'Insights only',
    description: 'Notify training data changes without workout recommendations.',
  },
  {
    value: 'suggest',
    label: 'Suggest workouts',
    description: "Show today's workout recommendation in addition to data insights.",
  },
  {
    value: 'coach',
    label: 'Coach weekly plan',
    description: 'Create weekly draft plans and apply them after approval.',
  },
];

const RECOMMEND_MODE_OPTIONS: { value: RecommendMode; label: string; description: string }[] = [
  {
    value: 'hybrid',
    label: '🔬 Hybrid',
    description: 'Use local knowledge files plus web search for grounded recommendations.',
  },
  {
    value: 'web_only',
    label: '🌐 Web search only',
    description: 'Prefer current web information for recommendations.',
  },
  {
    value: 'no_grounding',
    label: '💭 Model knowledge only',
    description: 'Use model knowledge without external grounding.',
  },
];

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

export function intervalsIcuSaveMessage(data: IntervalsIcuStatus): string {
  const verification = data.verification;
  if (verification?.status === 'verified') {
    return 'Saved. Intervals.icu verification succeeded.';
  }
  if (verification?.status === 'failed' || verification?.status === 'missing') {
    return `Saved, but Intervals.icu verification failed: ${verification.message}`;
  }
  if (verification?.status === 'skipped') {
    return `Saved, but Intervals.icu verification was skipped: ${verification.message}`;
  }
  return 'Saved';
}

export function intervalsIcuTestMessage(data: IntervalsIcuStatus): string {
  const verification = data.verification;
  if (verification?.status === 'verified') {
    return 'Intervals.icu verification succeeded. MyWhoosh may take a few minutes to sync.';
  }
  if (verification?.status === 'failed' || verification?.status === 'missing') {
    return `Intervals.icu verification failed: ${verification.message}`;
  }
  if (verification?.status === 'skipped') {
    return `Intervals.icu verification was skipped: ${verification.message}`;
  }
  return 'Intervals.icu verification ran';
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
  const [localLocale, setLocalLocale] = useState<UserLocale>(settings.locale);
  const [localTimezone, setLocalTimezone] = useState(settings.timezone);
  const [localWeeklySchedule, setLocalWeeklySchedule] = useState<WeeklySchedule>(
    settings.weeklySchedule,
  );
  const [localAsOf, setLocalAsOf] = useState<string>(settings.asOf ?? '');
  const [saved, setSaved] = useState(false);
  const [goalDateError, setGoalDateError] = useState<string | null>(null);
  const [intervalsIcuApiKey, setIntervalsIcuApiKey] = useState('');
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
    setLocalLocale(settings.locale);
    setLocalTimezone(settings.timezone);
    setLocalWeeklySchedule(settings.weeklySchedule);
    setLocalAsOf(settings.asOf ?? '');
  });

  useEffect(() => {
    syncLocalSettings();
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/intervals-icu', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: IntervalsIcuStatus | null) => {
        if (!data || cancelled) return;
        setIntervalsIcuConfigured(data.configured);
        setIntervalsIcuEncryptionReady(data.encryption_ready ?? true);
        if (data.encryption_ready === false) {
          setIntervalsIcuMessage(
            'KMS_KEY_NAME is not set, so Intervals.icu API keys cannot be saved.',
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
      setGoalDateError('Goal date must use YYYY-MM-DD format.');
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
      locale: localLocale,
      timezone: localTimezone,
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

  const handleSaveIntervalsIcu = async () => {
    setIntervalsIcuMessage(null);
    const res = await fetch('/api/settings/intervals-icu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: intervalsIcuApiKey,
        athlete_id: INTERVALS_ICU_ATHLETE_ID,
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | IntervalsIcuStatus
      | { error?: string }
      | null;
    if (!res.ok) {
      setIntervalsIcuMessage(
        data && 'error' in data ? data.error || 'Could not save' : 'Could not save',
      );
      return;
    }
    if (data && 'configured' in data) {
      setIntervalsIcuConfigured(data.configured);
    }
    setIntervalsIcuApiKey('');
    setIntervalsIcuMessage(data && 'configured' in data ? intervalsIcuSaveMessage(data) : 'Saved');
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
        data && 'error' in data ? data.error || 'Could not verify' : 'Could not verify',
      );
      return;
    }
    if (data && 'configured' in data) {
      setIntervalsIcuConfigured(data.configured);
    }
    setIntervalsIcuMessage(
      data && 'configured' in data ? intervalsIcuTestMessage(data) : 'Verified',
    );
    setAgentLogRefreshSignal((value) => value + 1);
  };

  const handleDeleteIntervalsIcu = async () => {
    setIntervalsIcuMessage(null);
    const res = await fetch('/api/settings/intervals-icu', { method: 'DELETE' });
    if (!res.ok) {
      setIntervalsIcuMessage('Could not disconnect');
      return;
    }
    setIntervalsIcuConfigured(false);
    setIntervalsIcuApiKey('');
    setIntervalsIcuMessage('Disconnected');
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

  const estimatedAge = 220 - localMaxHR;

  return (
    <div className="settings-grid">
      <div className="settings-card settings-card-full">
        <AgentOperationLogPanel refreshSignal={agentLogRefreshSignal} />
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">⚡ FTP</h3>
        <div className="settings-value-row">
          <input
            type="number"
            value={localFtp}
            onChange={(e) => setLocalFtp(Number(e.target.value))}
            min={100}
            max={500}
            className="settings-number-input"
          />
          <span className="settings-muted">watts</span>
        </div>
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">⚖️ Body Weight</h3>
        <div className="settings-value-row">
          <input
            type="number"
            value={localWeight}
            onChange={(e) => setLocalWeight(Number(e.target.value))}
            min={40}
            max={150}
            className="settings-number-input"
          />
          <span className="settings-muted">kg</span>
          <div className="settings-pill">
            <span style={{ opacity: 0.7 }}>W/kg: </span>
            <strong style={{ color: 'var(--primary)' }}>
              {(localFtp / localWeight).toFixed(2)} W/kg
            </strong>
          </div>
        </div>
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">❤️ Max Heart Rate</h3>
        <div className="settings-value-row">
          <input
            type="number"
            value={localMaxHR}
            onChange={(e) => setLocalMaxHR(Number(e.target.value))}
            min={140}
            max={220}
            className="settings-number-input"
          />
          <span className="settings-muted">bpm</span>
          <div className="settings-pill">
            Estimated age: {estimatedAge > 0 ? estimatedAge : '?'}
          </div>
        </div>
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">🎯 Training Goal</h3>
        <div className="settings-stack">
          <div className="settings-goal-row">
            <select
              value={localGoal}
              onChange={(e) => setLocalGoal(e.target.value as typeof localGoal)}
              className="settings-select"
            >
              <option value="hillclimb_tt">🏔️ Race prep (hill climb / TT)</option>
              <option value="road_race">🏁 Race prep (road race)</option>
              <option value="ftp_improvement">⚡ FTP improvement</option>
              <option value="fitness_maintenance">💪 Fitness maintenance</option>
              <option value="other">✏️ Other</option>
            </select>
            <div>
              <label htmlFor="goalDate" className="settings-field-label">
                Goal Date
              </label>
              <input
                id="goalDate"
                type="date"
                value={localGoalDate}
                onChange={(e) => setLocalGoalDate(e.target.value)}
                className="settings-input"
                style={{ borderColor: goalDateError ? '#e74c3c' : undefined }}
              />
              {goalDateError && <div className="settings-error">{goalDateError}</div>}
            </div>
          </div>
          {localGoal === 'other' && (
            <input
              type="text"
              value={localGoalCustom}
              onChange={(e) => setLocalGoalCustom(e.target.value)}
              placeholder="Example: triathlon prep"
              className="settings-input"
            />
          )}
        </div>
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">🌐 Agent Output</h3>
        <div className="settings-stack">
          <div>
            <label htmlFor="agentLocale" className="settings-field-label">
              Language
            </label>
            <select
              id="agentLocale"
              value={localLocale}
              onChange={(e) => setLocalLocale(e.target.value as UserLocale)}
              className="settings-select"
            >
              <option value="ja">Japanese</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label htmlFor="agentTimezone" className="settings-field-label">
              Timezone
            </label>
            <input
              id="agentTimezone"
              type="text"
              value={localTimezone}
              onChange={(e) => setLocalTimezone(e.target.value)}
              className="settings-input"
              placeholder="Asia/Tokyo"
            />
            <div className="settings-help-text">
              Detected from your browser and saved as an IANA timezone.
            </div>
          </div>
        </div>
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">📅 Weekly Schedule</h3>
        <div className="settings-week-strip">
          {DAY_NAMES.map((dayName) => (
            <div
              key={dayName}
              className={`settings-day-card ${
                localWeeklySchedule[dayName].available ? 'is-available' : ''
              }`}
            >
              <label className="settings-day-toggle">
                <input
                  type="checkbox"
                  checked={localWeeklySchedule[dayName].available}
                  onChange={(e) => updateDay(dayName, { available: e.target.checked })}
                />
                <strong>{DAY_LABELS[dayName]}</strong>
              </label>
              <div className="settings-day-minutes">
                <input
                  aria-label={`${DAY_LABELS[dayName]} max minutes`}
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
                />
                <span>min</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">🧠 Coach Autonomy</h3>
        <div className="settings-radio-grid">
          {COACH_AUTONOMY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`settings-radio-option ${
                localCoachAutonomy === opt.value ? 'is-selected' : ''
              }`}
            >
              <input
                type="radio"
                name="coachAutonomy"
                value={opt.value}
                checked={localCoachAutonomy === opt.value}
                onChange={() => setLocalCoachAutonomy(opt.value)}
              />
              <div>
                <div className="settings-radio-title">{opt.label}</div>
                <div className="settings-radio-description">{opt.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">🤖 AI Recommendation Mode</h3>
        <select
          value={localRecommendMode}
          onChange={(e) => setLocalRecommendMode(e.target.value as RecommendMode)}
          className="settings-select"
        >
          {RECOMMEND_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="settings-help-text" style={{ marginTop: '0.55rem' }}>
          {RECOMMEND_MODE_OPTIONS.find((o) => o.value === localRecommendMode)?.description}
        </div>
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">📊 Personal Data</h3>
        <label className="settings-value-row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={localUsePersonalData}
            onChange={(e) => setLocalUsePersonalData(e.target.checked)}
            style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--primary)' }}
          />
          <span>{localUsePersonalData ? 'ON - use Strava data' : 'OFF - generic guidance'}</span>
        </label>
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">🔔 Notifications</h3>
        <NotificationSettings showTitle={false} />
      </div>

      <div className="settings-card settings-card-row">
        <h3 className="settings-card-title">Intervals.icu</h3>
        <div className="settings-stack">
          <div>
            <label htmlFor="intervalsIcuApiKey" className="settings-field-label">
              API key (Developer Settings)
            </label>
            <input
              id="intervalsIcuApiKey"
              type="password"
              value={intervalsIcuApiKey}
              onChange={(e) => setIntervalsIcuApiKey(e.target.value)}
              placeholder={
                intervalsIcuConfigured ? 'Saved. Enter only to update.' : 'Paste API key'
              }
              autoComplete="off"
              className="settings-input"
            />
          </div>
          <div className="settings-actions">
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
          <div className="settings-help-text">
            <a href="https://intervals.icu/settings" target="_blank" rel="noreferrer">
              Intervals.icu Settings
            </a>
            {
              ' > Developer Settings, paste your API key. PerfRide stores it encrypted and uses athlete ID 0 internally for planned workout registration.'
            }
            <br />
            <a href="https://event.mywhoosh.com/user/profile" target="_blank" rel="noreferrer">
              MyWhoosh Profile
            </a>
            {' > Connections, enable Intervals.icu Read Calendar. '}
            <a
              href="https://mywhoosh.com/docs/partner-connections/"
              target="_blank"
              rel="noreferrer"
            >
              Official instructions
            </a>
            {' are also available. MyWhoosh may take a few minutes to sync.'}
          </div>
          <div className="settings-status-text">
            {intervalsIcuMessage ??
              (intervalsIcuConfigured ? 'Credential configured' : 'Credential not configured')}
          </div>
        </div>
      </div>

      {isDev && (
        <div
          className="settings-card settings-card-row"
          style={{
            border: '1px dashed var(--primary)',
            background: 'color-mix(in srgb, var(--primary) 4%, var(--surface))',
          }}
        >
          <h3 className="settings-card-title">🧪 Review Clock (dev)</h3>
          <div className="settings-inline-controls">
            <input
              type="datetime-local"
              value={localAsOf}
              onChange={(e) => setLocalAsOf(e.target.value)}
              className="settings-input"
              style={{ maxWidth: '230px' }}
            />
            <button
              type="button"
              onClick={handleResetAsOf}
              className="btn"
              style={{
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--foreground)',
              }}
            >
              Reset
            </button>
          </div>
          {settings.asOf && (
            <div className="settings-status-text" style={{ marginTop: '0.55rem' }}>
              Current review clock: <strong>{formatJstClockLabel(settings.asOf)} (JST)</strong>
            </div>
          )}
        </div>
      )}

      <div className="settings-save-row">
        <button type="button" onClick={handleSave} className="btn btn-primary">
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

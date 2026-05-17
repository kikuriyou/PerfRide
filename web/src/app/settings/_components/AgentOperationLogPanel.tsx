'use client';

import { useEffect, useState } from 'react';

import type { AgentOperationLogRecord, AgentOperationLogStatus } from '@/lib/gcs-schema';

const STATUS_LABELS: Record<AgentOperationLogStatus, string> = {
  triggered: 'Triggered',
  started: 'Started',
  completed: 'Done',
  error: 'Error',
  skipped: 'Skipped',
};

const STATUS_COLORS: Record<AgentOperationLogStatus, string> = {
  triggered: '#7c5cff',
  started: '#2476d1',
  completed: '#178a4f',
  error: '#c0392b',
  skipped: '#8a6d1d',
};

const OPERATION_LABELS: Record<string, string> = {
  strava_webhook: 'Strava webhook',
  webhook_recommend: 'Webhook recommendation',
  daily_recommend: 'Daily recommendation',
  daily_response: 'Daily response',
  weekly_plan: 'Weekly plan',
  ambient_flow: 'Ambient flow',
  workout_registration: 'Workout registration',
  mywhoosh_settings: 'MyWhoosh settings',
  intervals_icu_settings: 'Intervals.icu settings',
  insight: 'Insight',
};

interface AgentLogsResponse {
  logs?: AgentOperationLogRecord[];
}

interface AgentOperationLogPanelProps {
  refreshSignal?: number;
}

export function agentOperationStatusLabel(status: AgentOperationLogStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function agentOperationLabel(operation: string): string {
  return OPERATION_LABELS[operation] ?? operation;
}

export function formatAgentLogTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function statusStyle(status: AgentOperationLogStatus) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    minWidth: '58px',
    justifyContent: 'center',
    padding: '0.16rem 0.35rem',
    borderRadius: '999px',
    border: `1px solid ${STATUS_COLORS[status] ?? 'var(--border)'}`,
    color: STATUS_COLORS[status] ?? 'var(--foreground)',
    fontSize: '0.68rem',
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: 'nowrap' as const,
  };
}

export default function AgentOperationLogPanel({ refreshSignal = 0 }: AgentOperationLogPanelProps) {
  const [logs, setLogs] = useState<AgentOperationLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/agent-logs?limit=30', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AgentLogsResponse;
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setError('Could not load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/settings/agent-logs?limit=30', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AgentLogsResponse;
        if (!cancelled) setLogs(Array.isArray(data.logs) ? data.logs : []);
      } catch {
        if (!cancelled) setError('Could not load logs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '0.55rem',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Agent Operation Log</h3>
          <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', opacity: 0.65 }}>
            Latest {logs.length}
          </div>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          className="btn"
          disabled={loading}
          style={{
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--foreground)',
            padding: '0.38rem 0.65rem',
            fontSize: '0.82rem',
          }}
        >
          Refresh
        </button>
      </div>

      {loading && <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>Loading...</div>}
      {!loading && error && <div style={{ color: '#c0392b', fontSize: '0.9rem' }}>{error}</div>}
      {!loading && !error && logs.length === 0 && (
        <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>No logs yet</div>
      )}
      {!loading && !error && logs.length > 0 && (
        <div className="settings-log-list">
          {logs.map((log, index) => (
            <div
              key={`${log.created_at}-${log.run_id ?? index}-${log.status}`}
              className="settings-log-entry"
            >
              <div>
                <span style={statusStyle(log.status)}>{agentOperationStatusLabel(log.status)}</span>
              </div>
              <div className="settings-log-time">{formatAgentLogTime(log.created_at)}</div>
              <div className="settings-log-operation">
                <strong>{agentOperationLabel(log.operation)}</strong>
                <span>{log.trigger}</span>
              </div>
              <div className="settings-log-message">
                <div>{log.message}</div>
                <div className="settings-log-meta">
                  {log.trace_id && <span>trace: {log.trace_id}</span>}
                  {log.session_id && <span>session: {log.session_id}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

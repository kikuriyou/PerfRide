'use client';

import { useEffect, useState } from 'react';

import type { AgentOperationLogRecord, AgentOperationLogStatus } from '@/lib/gcs-schema';

const STATUS_LABELS: Record<AgentOperationLogStatus, string> = {
  triggered: 'トリガーON',
  started: '開始',
  completed: '完了',
  error: 'エラー',
  skipped: 'スキップ',
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
  webhook_recommend: 'Webhook 推薦',
  daily_recommend: 'Daily 推薦',
  daily_response: 'Daily 応答',
  weekly_plan: 'Weekly plan',
  ambient_flow: 'Ambient flow',
  workout_registration: 'Workout 登録',
  mywhoosh_settings: 'MyWhoosh 設定',
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
  return new Intl.DateTimeFormat('ja-JP', {
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
    minWidth: '74px',
    justifyContent: 'center',
    padding: '0.25rem 0.5rem',
    borderRadius: '999px',
    border: `1px solid ${STATUS_COLORS[status] ?? 'var(--border)'}`,
    color: STATUS_COLORS[status] ?? 'var(--foreground)',
    fontSize: '0.75rem',
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
      setError('ログを取得できませんでした');
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
        if (!cancelled) setError('ログを取得できませんでした');
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
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Agent 動作ログ</h3>
          <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', opacity: 0.65 }}>
            直近 {logs.length} 件
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
            padding: '0.55rem 0.85rem',
          }}
        >
          更新
        </button>
      </div>

      {loading && <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>読み込み中...</div>}
      {!loading && error && <div style={{ color: '#c0392b', fontSize: '0.9rem' }}>{error}</div>}
      {!loading && !error && logs.length === 0 && (
        <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>ログはまだありません</div>
      )}
      {!loading && !error && logs.length > 0 && (
        <div
          style={{
            display: 'grid',
            gap: '0.65rem',
            maxHeight: '420px',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            paddingRight: '0.25rem',
          }}
        >
          {logs.map((log, index) => (
            <div
              key={`${log.created_at}-${log.run_id ?? index}-${log.status}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '88px 1fr',
                gap: '0.75rem',
                alignItems: 'start',
                padding: '0.75rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--background)',
              }}
            >
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                <span style={statusStyle(log.status)}>{agentOperationStatusLabel(log.status)}</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                  {formatAgentLogTime(log.created_at)}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                  {agentOperationLabel(log.operation)}
                </div>
                <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{log.message}</div>
                <div
                  style={{
                    marginTop: '0.4rem',
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    fontSize: '0.75rem',
                    opacity: 0.6,
                    overflowWrap: 'anywhere',
                  }}
                >
                  <span>trigger: {log.trigger}</span>
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

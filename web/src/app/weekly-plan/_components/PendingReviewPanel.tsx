'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buildRespondBody, submitWeeklyResponse, type ReviewAction } from '../_lib/respond';

export interface PendingReviewSummary {
  review_id: string;
  week_start: string;
  plan_revision: number;
  status: string;
}

interface PendingReviewPanelProps {
  review: PendingReviewSummary;
}

export function PendingReviewPanel({ review }: PendingReviewPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'modifying'>('idle');
  const [submitting, setSubmitting] = useState<ReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modifyText, setModifyText] = useState('');

  async function dispatch(action: ReviewAction) {
    setSubmitting(action);
    setError(null);
    const body = buildRespondBody(
      review.review_id,
      review.plan_revision,
      action,
      action === 'modify' ? modifyText : undefined,
    );
    const result = await submitWeeklyResponse(body);
    if (result.status === 'ok') {
      setMode('idle');
      setModifyText('');
      router.refresh();
    } else {
      setError(result.message ?? 'failed');
    }
    setSubmitting(null);
  }

  return (
    <div
      data-testid="pending-review-banner"
      style={{
        padding: '0.85rem 1rem',
        background: 'rgba(255,152,0,0.1)',
        border: '1px solid rgba(255,152,0,0.4)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '1rem',
      }}
    >
      <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.35rem' }}>
        🔔 未承認の draft があります
      </div>
      <div style={{ fontSize: '0.78rem', opacity: 0.75, marginBottom: '0.65rem' }}>
        Revision {review.plan_revision} · {review.week_start} · status {review.status}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: '0.5rem',
            padding: '0.4rem 0.6rem',
            background: 'rgba(244,67,54,0.08)',
            borderRadius: 'var(--radius-sm)',
            color: '#c62828',
            fontSize: '0.78rem',
          }}
        >
          {error}
        </div>
      )}

      {mode === 'modifying' && (
        <div style={{ marginBottom: '0.65rem' }}>
          <textarea
            value={modifyText}
            onChange={(e) => setModifyText(e.target.value)}
            placeholder="修正内容を入力 (例: 火曜の強度を下げてください)"
            rows={3}
            style={{
              width: '100%',
              padding: '0.5rem 0.7rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '0.85rem',
              resize: 'vertical',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        {mode === 'idle' && (
          <>
            <button
              type="button"
              data-testid="approve-button"
              disabled={submitting !== null}
              onClick={() => dispatch('approve')}
              style={primaryButtonStyle('#4caf50', submitting !== null)}
            >
              {submitting === 'approve' ? '処理中...' : '承認'}
            </button>
            <button
              type="button"
              data-testid="modify-button"
              disabled={submitting !== null}
              onClick={() => setMode('modifying')}
              style={secondaryButtonStyle(submitting !== null)}
            >
              修正して再生成
            </button>
            <button
              type="button"
              data-testid="dismiss-button"
              disabled={submitting !== null}
              onClick={() => dispatch('dismiss')}
              style={ghostButtonStyle(submitting !== null)}
            >
              {submitting === 'dismiss' ? '処理中...' : '見送る'}
            </button>
          </>
        )}
        {mode === 'modifying' && (
          <>
            <button
              type="button"
              data-testid="modify-submit-button"
              disabled={submitting !== null || !modifyText.trim()}
              onClick={() => dispatch('modify')}
              style={primaryButtonStyle(
                'var(--primary, #009688)',
                submitting !== null || !modifyText.trim(),
              )}
            >
              {submitting === 'modify' ? '送信中...' : '送信'}
            </button>
            <button
              type="button"
              data-testid="modify-cancel-button"
              disabled={submitting !== null}
              onClick={() => {
                setMode('idle');
                setModifyText('');
                setError(null);
              }}
              style={ghostButtonStyle(submitting !== null)}
            >
              キャンセル
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function primaryButtonStyle(background: string, disabled: boolean): React.CSSProperties {
  return {
    padding: '0.4rem 0.9rem',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background,
    color: 'white',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '0.4rem 0.9rem',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--foreground)',
    fontSize: '0.85rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

function ghostButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '0.4rem 0.75rem',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'none',
    color: 'var(--foreground)',
    fontSize: '0.8rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 0.78,
  };
}

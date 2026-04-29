'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CSSProperties } from 'react';

import { CACHE_KEY } from '@/app/dashboard/_components/recommendCache';
import type { TrainingSession, WeeklyPlanReviewPayload } from '@/lib/gcs-schema';

type DailyAction = 'approve' | 'modify' | 'rest';
type WeeklyAction = 'approve' | 'modify' | 'dismiss' | 'open_review';
type WeeklyStatus = 'idle' | 'loading' | 'submitting' | 'done' | 'error';

interface DailyAgentResponse {
  message?: string;
  error?: string;
}

interface WeeklyActionResponse {
  status: string;
  review_id?: string;
  plan_revision?: number;
  message?: string;
  error?: string;
}

const QUICK_OPTIONS = [
  { label: 'もっと軽く', value: '強度をもっと軽くしてください' },
  { label: 'もっとハードに', value: 'もっとハードなメニューにしてください' },
  { label: '時間を短く', value: '時間を短くしてください' },
  { label: '別の種類に', value: '別の種類のトレーニングに変更してください' },
];

const MAX_QUICK_MODIFICATIONS = 3;

const styles = {
  container: {
    maxWidth: 560,
    margin: '0 auto',
    padding: '1rem',
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  } satisfies CSSProperties,
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '1rem',
  } satisfies CSSProperties,
  title: {
    fontSize: '1.15rem',
    fontWeight: 700,
    color: 'var(--foreground)',
  } satisfies CSSProperties,
  messageList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    paddingBottom: '1rem',
  } satisfies CSSProperties,
  agentBubble: {
    alignSelf: 'flex-start',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '0 var(--radius-lg) var(--radius-lg) var(--radius-lg)',
    padding: '0.75rem 1rem',
    maxWidth: '85%',
    fontSize: '0.9rem',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  } satisfies CSSProperties,
  userBubble: {
    alignSelf: 'flex-end',
    background: 'var(--primary)',
    color: '#fff',
    borderRadius: 'var(--radius-lg) 0 var(--radius-lg) var(--radius-lg)',
    padding: '0.75rem 1rem',
    maxWidth: '85%',
    fontSize: '0.9rem',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  } satisfies CSSProperties,
  quickButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  } satisfies CSSProperties,
  quickBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-full)',
    padding: '0.4rem 0.9rem',
    fontSize: '0.82rem',
    color: 'var(--foreground)',
    cursor: 'pointer',
  } satisfies CSSProperties,
  input: {
    width: '100%',
    padding: '0.75rem 0.9rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: '0.9rem',
  } satisfies CSSProperties,
  row: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  } satisfies CSSProperties,
  primaryBtn: {
    padding: '0.7rem 1rem',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  } satisfies CSSProperties,
  secondaryBtn: {
    padding: '0.7rem 1rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--foreground)',
    fontWeight: 600,
    cursor: 'pointer',
  } satisfies CSSProperties,
  sessionList: {
    display: 'grid',
    gap: '0.5rem',
  } satisfies CSSProperties,
} as const;

function clearRecommendCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

async function sendDailyToAgent(
  sessionId: string,
  action: DailyAction,
  userMessage: string | undefined,
  modificationCount: number,
): Promise<DailyAgentResponse> {
  const res = await fetch('/api/recommend/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      action,
      user_message: userMessage,
      modification_count: modificationCount,
    }),
  });
  return res.json();
}

async function fetchWeeklyReview(reviewId: string): Promise<WeeklyPlanReviewPayload> {
  const res = await fetch(`/api/weekly-plan/respond?review_id=${encodeURIComponent(reviewId)}`);
  const data = (await res.json()) as { review?: WeeklyPlanReviewPayload; error?: string };
  if (!res.ok || !data.review) {
    throw new Error(data.error || 'Failed to load review');
  }
  return data.review;
}

async function sendWeeklyAction(
  reviewId: string,
  action: Exclude<WeeklyAction, 'open_review'>,
  expectedPlanRevision: number,
  userMessage?: string,
): Promise<WeeklyActionResponse> {
  const res = await fetch('/api/weekly-plan/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      review_id: reviewId,
      action,
      user_message: userMessage,
      expected_plan_revision: expectedPlanRevision,
    }),
  });
  return res.json();
}

function ConfirmationView({ message }: { message: string }) {
  return (
    <div style={{ ...styles.container, justifyContent: 'center', textAlign: 'center' }}>
      {message}
    </div>
  );
}

function DailyChatView({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'agent'; text: string }[]>([]);
  const [modCount, setModCount] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [awaitingDecision, setAwaitingDecision] = useState(false);
  const [done, setDone] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const freeTextOnly = modCount >= MAX_QUICK_MODIFICATIONS;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const nextCount = modCount + 1;
    setModCount(nextCount);
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInputValue('');
    setLoading(true);
    setAwaitingDecision(false);

    try {
      const data = await sendDailyToAgent(sessionId, 'modify', text, nextCount);
      const agentText = data.message || data.error || '応答を取得できませんでした';
      setMessages((prev) => [...prev, { role: 'agent', text: agentText }]);
      setAwaitingDecision(true);
    } catch {
      setMessages((prev) => [...prev, { role: 'agent', text: '通信エラーが発生しました' }]);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return <ConfirmationView message="了解しました。更新されたメニューで進めます。" />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>メニューを変更</div>
      <div ref={listRef} style={styles.messageList}>
        {messages.length === 0 && <div style={styles.agentBubble}>どのように変更しますか？</div>}
        {messages.map((msg, index) => (
          <div key={index} style={msg.role === 'agent' ? styles.agentBubble : styles.userBubble}>
            {msg.text}
          </div>
        ))}
        {loading && <div style={{ ...styles.agentBubble, opacity: 0.6 }}>考え中...</div>}
      </div>
      {awaitingDecision ? (
        <div style={styles.row}>
          <button onClick={() => setDone(true)} style={styles.primaryBtn}>
            OK
          </button>
          <button onClick={() => setAwaitingDecision(false)} style={styles.secondaryBtn}>
            さらに変更
          </button>
        </div>
      ) : (
        <>
          {!freeTextOnly && (
            <div style={styles.quickButtons}>
              {QUICK_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  style={styles.quickBtn}
                  onClick={() => send(option.value)}
                  disabled={loading}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = inputValue.trim();
              if (!trimmed || loading) return;
              send(trimmed);
            }}
            style={styles.row}
          >
            <input
              style={styles.input}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={freeTextOnly ? '直接ご希望を入力...' : '変更内容を入力...'}
              disabled={loading}
            />
            <button
              type="submit"
              style={{ ...styles.primaryBtn, opacity: loading ? 0.5 : 1 }}
              disabled={loading || !inputValue.trim()}
            >
              送信
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function DailyDirectActionView({
  sessionId,
  action,
}: {
  sessionId: string;
  action: 'approve' | 'rest';
}) {
  const [message, setMessage] = useState('送信中...');

  useEffect(() => {
    let cancelled = false;
    sendDailyToAgent(sessionId, action, undefined, 0)
      .then((data) => {
        if (cancelled) return;
        setMessage(
          data.error ||
            (action === 'approve'
              ? '了解しました！頑張りましょう！'
              : '了解しました。休みましょう。'),
        );
      })
      .catch(() => {
        if (!cancelled) setMessage('通信エラーが発生しました');
      });
    return () => {
      cancelled = true;
    };
  }, [action, sessionId]);

  return <ConfirmationView message={message} />;
}

function SessionRow({ session }: { session: TrainingSession }) {
  return (
    <div style={{ ...styles.card, padding: '0.75rem 1rem' }}>
      <strong>{session.date}</strong>
      <div style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>
        {session.type} / {session.duration_minutes ?? 0} min / TSS {session.target_tss ?? 0}
      </div>
      {session.notes && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.82rem', opacity: 0.7 }}>
          {session.notes}
        </div>
      )}
    </div>
  );
}

function WeeklyReviewView({ reviewId, action }: { reviewId: string; action: WeeklyAction }) {
  const [review, setReview] = useState<WeeklyPlanReviewPayload | null>(null);
  const [status, setStatus] = useState<WeeklyStatus>('loading');
  const [message, setMessage] = useState('');
  const [modifyText, setModifyText] = useState('');
  const autoSubmittedRef = useRef(false);

  const load = async () => {
    setStatus('loading');
    try {
      const nextReview = await fetchWeeklyReview(reviewId);
      setReview(nextReview);
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to load review');
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [reviewId]);

  const submit = async (nextAction: Exclude<WeeklyAction, 'open_review'>, userMessage?: string) => {
    if (!review) return;
    setStatus('submitting');
    try {
      const response = await sendWeeklyAction(
        review.review_id,
        nextAction,
        review.plan_revision,
        userMessage,
      );
      clearRecommendCache();
      setMessage(response.message || response.status);
      if (response.status === 'modified') {
        const nextReview = await fetchWeeklyReview(review.review_id);
        setReview(nextReview);
        setStatus('idle');
        return;
      }
      setStatus('done');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to submit action');
    }
  };

  useEffect(() => {
    if (!review || autoSubmittedRef.current) return;
    if (action === 'approve' || action === 'dismiss') {
      autoSubmittedRef.current = true;
      submit(action).catch(() => {});
    }
  }, [action, review]);

  const summary = useMemo(() => {
    if (!review) return '';
    return review.draft.summary || `${review.draft.phase} / TSS ${review.draft.target_tss}`;
  }, [review]);

  if (status === 'loading') {
    return <ConfirmationView message="読み込み中..." />;
  }
  if (status === 'error') {
    return <ConfirmationView message={message} />;
  }
  if (!review) {
    return <ConfirmationView message="review が見つかりません。" />;
  }
  if (status === 'done') {
    return <ConfirmationView message={message || '処理が完了しました。'} />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.title}>今週のプラン案</div>
        <div style={{ marginTop: '0.75rem', fontSize: '0.95rem' }}>{summary}</div>
        <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.7 }}>
          week_start: {review.week_start} / phase: {review.draft.phase} / target_tss:{' '}
          {review.draft.target_tss} / revision: {review.plan_revision}
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', opacity: 0.6 }}>
          status: {review.status}
        </div>
      </div>

      <div style={styles.sessionList}>
        {review.draft.sessions.map((session) => (
          <SessionRow key={session.date} session={session} />
        ))}
      </div>

      <div style={styles.card}>
        <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>変更メモ</div>
        <textarea
          value={modifyText}
          onChange={(event) => setModifyText(event.target.value)}
          placeholder="例: 木曜は 45 分まで、土曜は外で走りたい"
          rows={4}
          style={{ ...styles.input, resize: 'vertical' }}
        />
        <div style={{ ...styles.row, marginTop: '0.75rem' }}>
          <button
            onClick={() => submit('approve')}
            style={styles.primaryBtn}
            disabled={status === 'submitting'}
          >
            承認
          </button>
          <button
            onClick={() => submit('modify', modifyText)}
            style={styles.secondaryBtn}
            disabled={status === 'submitting' || !modifyText.trim()}
          >
            修正して再生成
          </button>
          <button
            onClick={() => submit('dismiss')}
            style={styles.secondaryBtn}
            disabled={status === 'submitting'}
          >
            見送る
          </button>
        </div>
        {status === 'submitting' && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.7 }}>送信中...</div>
        )}
        {message && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', opacity: 0.8 }}>{message}</div>
        )}
      </div>
    </div>
  );
}

export function resolveRespondMode(searchParams: URLSearchParams): {
  kind: 'weekly' | 'daily' | 'invalid';
  sessionId: string;
  reviewId: string;
  action: string;
} {
  const kind = searchParams.get('kind');
  const sessionId = searchParams.get('session_id') || '';
  const reviewId = searchParams.get('review_id') || '';
  const action = searchParams.get('action') || '';
  if (kind === 'weekly_review' || reviewId) {
    return { kind: reviewId ? 'weekly' : 'invalid', sessionId, reviewId, action };
  }
  if (!sessionId) {
    return { kind: 'invalid', sessionId, reviewId, action };
  }
  return { kind: 'daily', sessionId, reviewId, action };
}

function RespondPageInner() {
  const searchParams = useSearchParams();
  const resolved = resolveRespondMode(searchParams);
  const action = resolved.action as WeeklyAction | DailyAction;

  if (resolved.kind === 'weekly') {
    return (
      <WeeklyReviewView
        reviewId={resolved.reviewId}
        action={(action as WeeklyAction) || 'open_review'}
      />
    );
  }

  if (resolved.kind === 'invalid') {
    return <ConfirmationView message="session_id がありません。" />;
  }

  if (action === 'approve' || action === 'rest') {
    return <DailyDirectActionView sessionId={resolved.sessionId} action={action} />;
  }

  return <DailyChatView sessionId={resolved.sessionId} />;
}

export default function RespondPage() {
  return (
    <Suspense fallback={<ConfirmationView message="読み込み中..." />}>
      <RespondPageInner />
    </Suspense>
  );
}

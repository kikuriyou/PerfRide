'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CSSProperties } from 'react';

type Action = 'approve' | 'modify' | 'rest';

interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
}

interface AgentResponse {
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
    maxWidth: 480,
    margin: '0 auto',
    padding: '1rem',
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
  } satisfies CSSProperties,
  title: {
    fontSize: '1.1rem',
    fontWeight: 600,
    marginBottom: '1rem',
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
    marginBottom: '0.75rem',
  } satisfies CSSProperties,
  quickBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-full)',
    padding: '0.4rem 0.9rem',
    fontSize: '0.82rem',
    color: 'var(--foreground)',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  } satisfies CSSProperties,
  inputRow: {
    display: 'flex',
    gap: '0.5rem',
  } satisfies CSSProperties,
  input: {
    flex: 1,
    padding: '0.65rem 0.9rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--foreground)',
    fontSize: '0.9rem',
    outline: 'none',
  } satisfies CSSProperties,
  sendBtn: {
    padding: '0.65rem 1.1rem',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
  } satisfies CSSProperties,
  actionButtons: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem',
  } satisfies CSSProperties,
  okBtn: {
    flex: 1,
    padding: '0.6rem',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer',
  } satisfies CSSProperties,
  modifyMoreBtn: {
    flex: 1,
    padding: '0.6rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--foreground)',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer',
  } satisfies CSSProperties,
  confirmation: {
    textAlign: 'center',
    padding: '3rem 1rem',
    fontSize: '1rem',
    color: 'var(--foreground)',
  } satisfies CSSProperties,
  freeTextHint: {
    fontSize: '0.8rem',
    color: 'var(--primary)',
    marginBottom: '0.5rem',
    fontWeight: 500,
  } satisfies CSSProperties,
};

async function sendToAgent(
  sessionId: string,
  action: Action,
  userMessage: string | undefined,
  modificationCount: number,
): Promise<AgentResponse> {
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

function ConfirmationView({ message }: { message: string }) {
  return <div style={styles.confirmation}>{message}</div>;
}

function ChatView({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
      const data = await sendToAgent(sessionId, 'modify', text, nextCount);
      const agentText = data.message || data.error || '応答を取得できませんでした';
      setMessages((prev) => [...prev, { role: 'agent', text: agentText }]);
      setAwaitingDecision(true);
    } catch {
      setMessages((prev) => [...prev, { role: 'agent', text: '通信エラーが発生しました' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleOk = () => setDone(true);
  const handleModifyMore = () => setAwaitingDecision(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || loading) return;
    send(trimmed);
  };

  if (done) {
    return <ConfirmationView message="了解しました。更新されたメニューで進めます。" />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>メニューを変更</div>

      <div ref={listRef} style={styles.messageList}>
        {messages.length === 0 && <div style={styles.agentBubble}>どのように変更しますか？</div>}
        {messages.map((msg, i) => (
          <div key={i} style={msg.role === 'agent' ? styles.agentBubble : styles.userBubble}>
            {msg.text}
          </div>
        ))}
        {loading && <div style={{ ...styles.agentBubble, opacity: 0.6 }}>考え中...</div>}
      </div>

      {awaitingDecision && !loading && (
        <div style={styles.actionButtons}>
          <button onClick={handleOk} style={styles.okBtn}>
            OK
          </button>
          <button onClick={handleModifyMore} style={styles.modifyMoreBtn}>
            さらに変更
          </button>
        </div>
      )}

      {!awaitingDecision && !loading && (
        <>
          {freeTextOnly && <div style={styles.freeTextHint}>直接ご希望を教えてください</div>}
          {!freeTextOnly && (
            <div style={styles.quickButtons}>
              {QUICK_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  style={styles.quickBtn}
                  onClick={() => send(opt.value)}
                  disabled={loading}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={handleSubmit} style={styles.inputRow}>
            <input
              style={styles.input}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="変更内容を入力..."
              disabled={loading}
            />
            <button
              type="submit"
              style={{ ...styles.sendBtn, opacity: loading ? 0.5 : 1 }}
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

type DirectStatus = 'idle' | 'loading' | 'done' | 'error';

function useDirectAction(sessionId: string, action: 'approve' | 'rest') {
  const [status, setStatus] = useState<DirectStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    sendToAgent(sessionId, action, undefined, 0)
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setErrorMsg(data.error);
          setStatus('error');
        } else {
          setStatus('done');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMsg('通信エラーが発生しました');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, action]);

  return { status, errorMsg };
}

function DirectActionView({
  sessionId,
  action,
}: {
  sessionId: string;
  action: 'approve' | 'rest';
}) {
  const { status, errorMsg } = useDirectAction(sessionId, action);

  if (status === 'loading') {
    return <ConfirmationView message="送信中..." />;
  }
  if (status === 'error') {
    return <ConfirmationView message={errorMsg} />;
  }
  const msg =
    action === 'approve'
      ? '了解しました！頑張りましょう！'
      : '了解しました。ゆっくり休んでください。';
  return <ConfirmationView message={msg} />;
}

export default function RespondPage() {
  const searchParams = useSearchParams();
  const action = (searchParams.get('action') || 'modify') as Action;
  const sessionId = searchParams.get('session_id') || '';

  if (!sessionId) {
    return <ConfirmationView message="セッションが見つかりません" />;
  }

  if (action === 'approve' || action === 'rest') {
    return <DirectActionView sessionId={sessionId} action={action} />;
  }

  return <ChatView sessionId={sessionId} />;
}

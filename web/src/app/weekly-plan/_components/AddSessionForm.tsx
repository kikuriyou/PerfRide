'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { submitAppend, type AppendBody } from '../_lib/append';
import { SESSION_TYPE_META } from '../_lib/session-display';

interface AddSessionFormProps {
  weekStart: string;
  today: string;
  planRevision: number;
}

const SESSION_TYPE_OPTIONS = Object.entries(SESSION_TYPE_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

export function AddSessionForm({ weekStart, today, planRevision }: AddSessionFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sessionDate, setSessionDate] = useState(today);
  const [sessionType, setSessionType] = useState<string>('endurance');
  const [duration, setDuration] = useState<number>(60);
  const [tss, setTss] = useState<number>(40);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div style={{ marginTop: '1rem' }}>
        <button
          type="button"
          data-testid="open-add-session"
          onClick={() => setOpen(true)}
          style={{
            padding: '0.45rem 0.95rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border)',
            background: 'transparent',
            color: 'var(--foreground)',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          + Add session to this week
        </button>
      </div>
    );
  }

  async function handleSubmit() {
    setError(null);
    if (!sessionDate || sessionDate < weekStart) {
      setError('session_date must be within this week');
      return;
    }
    setSubmitting(true);
    const body: AppendBody = {
      session_date: sessionDate,
      session_type: sessionType,
      duration_minutes: Math.max(0, Math.floor(duration)),
      target_tss: Math.max(0, Math.floor(tss)),
      expected_plan_revision: planRevision,
    };
    if (notes.trim()) body.notes = notes.trim();

    const result = await submitAppend(body);
    setSubmitting(false);
    if (result.status === 'ok') {
      setOpen(false);
      setNotes('');
      router.refresh();
      return;
    }
    if (result.status === 'conflict') {
      const current =
        result.currentPlanRevision !== undefined ? ` (current ${result.currentPlanRevision})` : '';
      setError(`Plan was updated elsewhere${current}. Refresh and try again.`);
      return;
    }
    setError(result.message ?? 'append failed');
  }

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.85rem 1rem',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface)',
      }}
    >
      <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.6rem' }}>
        Add session
      </div>
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: '0.6rem',
            padding: '0.4rem 0.6rem',
            background: 'rgba(244,67,54,0.08)',
            color: '#c62828',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.78rem',
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.6rem',
          marginBottom: '0.6rem',
        }}
      >
        <label style={{ fontSize: '0.78rem' }}>
          Date
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: '0.78rem' }}>
          Type
          <select
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value)}
            style={inputStyle}
          >
            {SESSION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.78rem' }}>
          Duration (min)
          <input
            type="number"
            min={0}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: '0.78rem' }}>
          Target TSS
          <input
            type="number"
            min={0}
            value={tss}
            onChange={(e) => setTss(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      </div>
      <label style={{ fontSize: '0.78rem' }}>
        Notes (optional)
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={inputStyle}
          placeholder="e.g. easy spin"
        />
      </label>
      <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.7rem' }}>
        <button
          type="button"
          data-testid="submit-add-session"
          disabled={submitting}
          onClick={handleSubmit}
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: '#009688',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? '追加中...' : 'Add'}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'none',
            color: 'var(--foreground)',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: '0.2rem',
  padding: '0.35rem 0.5rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.85rem',
};

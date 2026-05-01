'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSettings } from '@/lib/settings';
import {
  COACH_STATUS_DISMISS_KEY,
  dismissCoachStatusItem,
  readDismissedCoachStatusIds,
  selectCoachStatusItem,
  type CoachStatusBannerItem,
} from './coach-status-banner-helpers';

interface CoachStatusResponse {
  items?: CoachStatusBannerItem[];
}

export default function CoachStatusBanner() {
  const { settings, isLoaded } = useSettings();
  const [item, setItem] = useState<CoachStatusBannerItem | null>(null);

  useEffect(() => {
    if (!isLoaded || settings.coachAutonomy !== 'coach') {
      return;
    }

    let cancelled = false;
    fetch('/api/coach-status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CoachStatusResponse | null) => {
        if (cancelled) return;
        const items = data?.items ?? [];
        const dismissed =
          typeof window === 'undefined'
            ? new Set<string>()
            : readDismissedCoachStatusIds(window.localStorage);
        setItem(selectCoachStatusItem(items, dismissed));
      })
      .catch(() => {
        if (!cancelled) setItem(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, settings.coachAutonomy]);

  if (!isLoaded || settings.coachAutonomy !== 'coach' || !item) return null;

  const dismiss = () => {
    dismissCoachStatusItem(window.localStorage, item.id);
    setItem(null);
    window.dispatchEvent(new Event(COACH_STATUS_DISMISS_KEY));
  };

  return (
    <div
      role="status"
      style={{
        marginBottom: '1rem',
        padding: '0.7rem 0.9rem',
        border: '1px solid rgba(0,150,136,0.22)',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(0,150,136,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        fontSize: '0.86rem',
      }}
    >
      <span style={{ flex: 1 }}>{item.message}</span>
      {item.href && item.actionLabel && (
        <Link
          href={item.href}
          onClick={dismiss}
          style={{
            color: 'var(--primary)',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {item.actionLabel}
        </Link>
      )}
      <button
        type="button"
        aria-label="通知を閉じる"
        onClick={dismiss}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--foreground)',
          cursor: 'pointer',
          opacity: 0.55,
          fontSize: '1rem',
          lineHeight: 1,
          padding: '0.15rem 0.25rem',
        }}
      >
        ×
      </button>
    </div>
  );
}

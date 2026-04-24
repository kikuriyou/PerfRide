'use client';

import { useState, useEffect, type CSSProperties } from 'react';

type PushState = 'default' | 'granted' | 'denied' | 'unsupported' | 'subscribed';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.75rem 0',
  borderBottom: '1px solid var(--border)',
};

const labelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.9rem',
};

const statusStyle = (active: boolean): CSSProperties => ({
  fontSize: '0.78rem',
  padding: '0.2rem 0.6rem',
  borderRadius: '1rem',
  background: active ? 'rgba(46, 204, 113, 0.15)' : 'var(--surface)',
  color: active ? '#2ecc71' : 'var(--foreground)',
  border: `1px solid ${active ? '#2ecc71' : 'var(--border)'}`,
  opacity: active ? 1 : 0.7,
});

const buttonStyle: CSSProperties = {
  background: 'var(--primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: '0.5rem 1rem',
  fontSize: '0.85rem',
  cursor: 'pointer',
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    array[i] = raw.charCodeAt(i);
  }
  return array;
}

export default function NotificationSettings() {
  const [pushState, setPushState] = useState<PushState>('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setPushState('denied');
      return;
    }

    if (Notification.permission === 'granted') {
      navigator.serviceWorker
        .getRegistration('/sw.js')
        .then((reg) => {
          if (reg) {
            return reg.pushManager.getSubscription();
          }
          return null;
        })
        .then((sub) => {
          setPushState(sub ? 'subscribed' : 'granted');
        })
        .catch(() => {
          setPushState('granted');
        });
    }
  }, []);

  async function enablePush() {
    setLoading(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushState(permission === 'denied' ? 'denied' : 'default');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setError('VAPID key not configured');
        return;
      }

      const keyArray = urlBase64ToUint8Array(vapidKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyArray.buffer as ArrayBuffer,
      });

      const subJson = subscription.toJSON();
      const res = await fetch('/api/settings/notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          web_push_subscription: {
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          },
          channels: ['web_push'],
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save subscription');
      }

      setPushState('subscribed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable notifications');
    } finally {
      setLoading(false);
    }
  }

  const pushEnabled = pushState === 'subscribed';

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🔔 Notifications</h3>

      <div style={rowStyle}>
        <div style={labelStyle}>
          <span>Web Push</span>
          <span style={statusStyle(pushEnabled)}>{pushEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        {pushState === 'unsupported' && (
          <span style={{ fontSize: '0.78rem', opacity: 0.6 }}>Not supported</span>
        )}
        {pushState === 'denied' && (
          <span style={{ fontSize: '0.78rem', color: '#e74c3c' }}>Blocked by browser</span>
        )}
        {(pushState === 'default' || pushState === 'granted') && (
          <button
            onClick={enablePush}
            disabled={loading}
            style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Enabling...' : 'Enable'}
          </button>
        )}
        {pushState === 'subscribed' && (
          <span style={{ fontSize: '0.78rem', opacity: 0.6 }}>Active</span>
        )}
      </div>

      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <div style={labelStyle}>
          <span>LINE</span>
          <span style={statusStyle(false)}>Not connected</span>
        </div>
        <span style={{ fontSize: '0.78rem', opacity: 0.5 }}>Coming soon</span>
      </div>

      {error && (
        <p style={{ color: '#e74c3c', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>
      )}
    </div>
  );
}

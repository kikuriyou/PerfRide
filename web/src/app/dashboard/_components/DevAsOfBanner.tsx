'use client';

import { useSettings } from '@/lib/settings';

export default function DevAsOfBanner() {
  const { settings } = useSettings();
  if (!settings.asOf) return null;

  const display = (() => {
    const parsed = new Date(settings.asOf);
    if (Number.isNaN(parsed.getTime())) return `${settings.asOf} (JST)`;
    const formatted = parsed.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${formatted} (JST)`;
  })();

  return (
    <div
      style={{
        marginBottom: '1rem',
        padding: '0.75rem 1rem',
        background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
        border: '1px dashed var(--primary)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.85rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
      role="status"
    >
      <span>🧪</span>
      <span>
        開発モード: <strong>{display}</strong> 時点の推薦を表示中（キャッシュは無効）
      </span>
    </div>
  );
}

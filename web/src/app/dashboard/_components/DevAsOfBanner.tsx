'use client';

import { useSettings } from '@/lib/settings';
import { formatJstClockLabel } from '@/lib/weekly-plan-reference';

export default function DevAsOfBanner() {
  const { settings } = useSettings();
  if (!settings.asOf) return null;

  const display = `${formatJstClockLabel(settings.asOf)} (JST)`;

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
        Dev mode: showing recommendations as of <strong>{display}</strong>; cache disabled.
      </span>
    </div>
  );
}

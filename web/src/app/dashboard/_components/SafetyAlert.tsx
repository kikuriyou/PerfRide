'use client';

import type { SafetyAlertItem } from './safety-alert-helpers';
import { safetyAlertMessage } from './safety-alert-helpers';

interface SafetyAlertProps {
  item: SafetyAlertItem;
}

export default function SafetyAlert({ item }: SafetyAlertProps) {
  return (
    <div
      role="alert"
      style={{
        background: 'rgba(244,67,54,0.07)',
        border: '1px solid rgba(244,67,54,0.24)',
        borderLeft: '4px solid #e74c3c',
        borderRadius: 'var(--radius-md)',
        padding: '0.85rem 1rem',
        fontSize: '0.88rem',
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{item.title}</div>
      <div>{safetyAlertMessage(item)}</div>
    </div>
  );
}

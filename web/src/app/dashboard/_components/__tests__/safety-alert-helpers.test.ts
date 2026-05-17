import { describe, expect, it } from 'vitest';
import {
  remainingInsightItems,
  safetyAlertMessage,
  selectSafetyAlert,
} from '../safety-alert-helpers';

describe('safety alert helpers', () => {
  it('selects high fatigue insight as the safety alert', () => {
    const items = [
      { type: 'trend', title: 'CTL trend', summary: 'steady', priority: 'medium' },
      { type: 'high_fatigue', title: 'High fatigue', summary: 'TSB is low', priority: 'high' },
    ];
    const safety = selectSafetyAlert(items);

    expect(safety?.type).toBe('high_fatigue');
    expect(safetyAlertMessage(safety!)).toBe('Fatigue is elevated. Prioritize recovery today.');
    expect(remainingInsightItems(items, safety).map((item) => item.type)).toEqual(['trend']);
  });

  it('keeps normal insights out of SafetyAlert', () => {
    const items = [{ type: 'trend', title: 'CTL trend', summary: 'steady', priority: 'medium' }];
    expect(selectSafetyAlert(items)).toBeNull();
    expect(remainingInsightItems(items, null)).toEqual(items);
  });
});

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
      { type: 'high_fatigue', title: '疲労が高め', summary: 'TSB is low', priority: 'high' },
    ];
    const safety = selectSafetyAlert(items);

    expect(safety?.type).toBe('high_fatigue');
    expect(safetyAlertMessage(safety!)).toBe('疲労が高めです。今日は回復を優先しましょう。');
    expect(remainingInsightItems(items, safety).map((item) => item.type)).toEqual(['trend']);
  });

  it('keeps normal insights out of SafetyAlert', () => {
    const items = [{ type: 'trend', title: 'CTL trend', summary: 'steady', priority: 'medium' }];
    expect(selectSafetyAlert(items)).toBeNull();
    expect(remainingInsightItems(items, null)).toEqual(items);
  });
});

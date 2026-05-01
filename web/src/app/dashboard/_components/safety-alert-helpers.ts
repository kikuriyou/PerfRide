export interface SafetyAlertItem {
  type: string;
  title: string;
  summary: string;
  priority: string;
}

const SAFETY_TYPES = new Set(['fatigue', 'high_fatigue', 'tsb_drop', 'return_after_break']);

export function isSafetyInsight(item: SafetyAlertItem): boolean {
  const normalizedType = item.type.toLowerCase();
  return (
    item.priority === 'high' ||
    SAFETY_TYPES.has(normalizedType) ||
    normalizedType.includes('fatigue') ||
    normalizedType.includes('tsb')
  );
}

export function selectSafetyAlert<T extends SafetyAlertItem>(items: T[]): T | null {
  return items.find(isSafetyInsight) ?? null;
}

export function remainingInsightItems<T extends SafetyAlertItem>(
  items: T[],
  safetyItem: T | null,
): T[] {
  if (!safetyItem) return items;
  return items.filter((item) => item.type !== safetyItem.type);
}

export function safetyAlertMessage(item: SafetyAlertItem): string {
  const source = `${item.type} ${item.title} ${item.summary}`.toLowerCase();
  if (source.includes('fatigue') || source.includes('疲労') || source.includes('tsb')) {
    return '疲労が高めです。今日は回復を優先しましょう。';
  }
  return item.summary || item.title;
}

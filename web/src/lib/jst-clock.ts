export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstTimestamp(dateStr: string): number {
  const core = dateStr.replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
  const parsed = Date.parse(core + 'Z');
  return Number.isNaN(parsed) ? NaN : parsed - JST_OFFSET_MS;
}

export function parseJstClock(dateStr: string): Date | null {
  const ts = jstTimestamp(dateStr);
  return Number.isNaN(ts) ? null : new Date(ts);
}

export interface NotificationAction {
  id: string;
  label: string;
}

export type NotificationMetadata = Record<string, unknown>;

function encodeValue(value: unknown): string {
  return encodeURIComponent(String(value));
}

export function buildLinePostbackData(
  action: NotificationAction,
  metadata?: NotificationMetadata,
): string {
  const params = new URLSearchParams();
  params.set('action', action.id);
  if (metadata) {
    Object.entries(metadata).forEach(([key, value]) => {
      if (value === undefined || value === null || typeof value === 'object') return;
      params.set(key, String(value));
    });
  }
  return params.toString();
}

export function buildPushPayloadData(metadata?: NotificationMetadata): NotificationMetadata {
  return metadata ? { ...metadata } : {};
}

export function parsePostbackData(data: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of data.split('&')) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      params[key] = decodeURIComponent(value);
    }
  }
  return params;
}

export function serializeMetadata(metadata?: NotificationMetadata): string {
  if (!metadata) return '';
  return Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && typeof value !== 'object')
    .map(([key, value]) => `${encodeValue(key)}=${encodeValue(value)}`)
    .join('&');
}

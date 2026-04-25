export function buildRespondUrl(
  respondPath: string | undefined,
  metadata?: Record<string, unknown>,
  action?: string,
): string {
  const baseUrl = new URL(respondPath || '/dashboard', 'https://perfride.local');
  const params = new URLSearchParams(baseUrl.search);
  if (metadata) {
    Object.entries(metadata).forEach(([key, value]) => {
      if (
        key === 'respond_path' ||
        key === 'respond_url' ||
        value === undefined ||
        value === null ||
        typeof value === 'object'
      ) {
        return;
      }
      params.set(key, String(value));
    });
  }
  if (action) {
    params.set('action', action);
  }
  const search = params.toString();
  return `${baseUrl.pathname}${search ? `?${search}` : ''}`;
}

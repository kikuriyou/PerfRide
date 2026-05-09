type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type HeaderRecord = Record<string, string | string[] | undefined>;
type HeaderSource = Headers | HeaderRecord | { get: (name: string) => string | null | undefined };

function headerValue(value: string | string[] | null | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function readHeader(headers: HeaderSource, name: string): string | null {
  const maybeGet = (headers as { get?: unknown }).get;
  if (typeof maybeGet === 'function') {
    const value =
      maybeGet.call(headers, name) ??
      maybeGet.call(headers, name.toLowerCase()) ??
      maybeGet.call(headers, name.toUpperCase());
    return headerValue(value);
  }

  const record = headers as HeaderRecord;
  const requested = name.toLowerCase();
  const matchedKey = Object.keys(record).find((key) => key.toLowerCase() === requested);
  const value = matchedKey ? record[matchedKey] : undefined;
  return headerValue(value);
}

export function getAgentApiUrl(): string {
  const value = process.env.AGENT_API_URL?.trim();
  if (!value) {
    throw new Error('AGENT_API_URL is not set');
  }
  return value.replace(/\/+$/, '');
}

async function getAgentAuthorizationHeader(): Promise<string | null> {
  const audience = (process.env.AGENT_AUDIENCE || process.env.AGENT_API_URL || '').trim();
  if (!process.env.AGENT_AUDIENCE && process.env.NODE_ENV !== 'production') return null;
  if (!audience) return null;

  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(audience);
  const headers = (await client.getRequestHeaders(audience)) as HeaderSource;
  return readHeader(headers, 'authorization');
}

export async function agentFetch(
  path: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const authHeader = await getAgentAuthorizationHeader();
  if (authHeader) headers.set('Authorization', authHeader);

  return fetchImpl(`${getAgentApiUrl()}${path}`, {
    ...init,
    headers,
  });
}

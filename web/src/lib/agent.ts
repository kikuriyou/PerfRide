type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type HeaderRecord = Record<string, string | string[] | undefined>;

function readHeader(headers: Headers | HeaderRecord, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
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
  const headers = (await client.getRequestHeaders(audience)) as Headers | HeaderRecord;
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

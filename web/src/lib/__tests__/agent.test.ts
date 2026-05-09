import { afterEach, describe, expect, it, vi } from 'vitest';

import { agentFetch, getAgentApiUrl } from '@/lib/agent';

const googleAuthMocks = vi.hoisted(() => ({
  getIdTokenClient: vi.fn(),
  getRequestHeaders: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(function GoogleAuth() {
    return {
      getIdTokenClient: googleAuthMocks.getIdTokenClient,
    };
  }),
}));

describe('agent helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    googleAuthMocks.getIdTokenClient.mockReset();
    googleAuthMocks.getRequestHeaders.mockReset();
  });

  it('requires AGENT_API_URL', () => {
    vi.stubEnv('AGENT_API_URL', '');
    expect(() => getAgentApiUrl()).toThrow(/AGENT_API_URL/);
  });

  it('forwards JSON requests to the configured agent URL', async () => {
    vi.stubEnv('AGENT_API_URL', 'http://agent:8000/');
    vi.stubEnv('AGENT_AUDIENCE', '');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));

    await agentFetch('/health', { method: 'POST', body: '{}' }, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://agent:8000/health',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.has('Authorization')).toBe(false);
  });

  it('adds an ID token authorization header for private Cloud Run agent calls', async () => {
    vi.stubEnv('AGENT_API_URL', 'https://agent.example.run.app/');
    vi.stubEnv('AGENT_AUDIENCE', 'https://agent.example.run.app');
    googleAuthMocks.getIdTokenClient.mockResolvedValue({
      getRequestHeaders: googleAuthMocks.getRequestHeaders,
    });
    googleAuthMocks.getRequestHeaders.mockResolvedValue({
      get: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer id-token' : null),
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));

    await agentFetch('/recommend', { method: 'POST', body: '{}' }, fetchMock);

    expect(googleAuthMocks.getIdTokenClient).toHaveBeenCalledWith('https://agent.example.run.app');
    expect(googleAuthMocks.getRequestHeaders).toHaveBeenCalledWith('https://agent.example.run.app');
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer id-token');
  });

  it('reads capitalized authorization headers returned as plain objects', async () => {
    vi.stubEnv('AGENT_API_URL', 'https://agent.example.run.app/');
    vi.stubEnv('AGENT_AUDIENCE', 'https://agent.example.run.app');
    googleAuthMocks.getIdTokenClient.mockResolvedValue({
      getRequestHeaders: googleAuthMocks.getRequestHeaders,
    });
    googleAuthMocks.getRequestHeaders.mockResolvedValue({
      Authorization: 'Bearer object-token',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));

    await agentFetch('/recommend', { method: 'POST', body: '{}' }, fetchMock);

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer object-token');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { agentFetch, getAgentApiUrl } from '@/lib/agent';

describe('agent helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
});

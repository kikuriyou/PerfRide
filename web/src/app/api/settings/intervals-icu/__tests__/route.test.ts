import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DELETE,
  POST,
  PUT,
  intervalsIcuVerificationLogMessage,
  intervalsIcuVerificationLogStatus,
  resolveIntervalsIcuSaveError,
} from '../route';

const mocks = vi.hoisted(() => ({
  agentFetch: vi.fn(),
  deleteGCSObject: vi.fn(),
  encryptWithKms: vi.fn(),
  getKmsKeyName: vi.fn(),
  getServerSession: vi.fn(),
  isKmsConfigured: vi.fn(),
  readGCSJSON: vi.fn(),
  recordAgentOperationLog: vi.fn(),
  writeGCSJSON: vi.fn(),
}));

vi.mock('next-auth/next', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/agent', () => ({
  agentFetch: mocks.agentFetch,
}));

vi.mock('@/lib/agent-operation-log', () => ({
  recordAgentOperationLog: mocks.recordAgentOperationLog,
}));

vi.mock('@/lib/gcs-settings', () => ({
  deleteGCSObject: mocks.deleteGCSObject,
  readGCSJSON: mocks.readGCSJSON,
  userObjectPath: (userId: string, filename: string) =>
    `users/${userId}/${filename.replace(/^\/+/, '')}`,
  writeGCSJSON: mocks.writeGCSJSON,
}));

vi.mock('@/lib/kms', () => ({
  encryptWithKms: mocks.encryptWithKms,
  getKmsKeyName: mocks.getKmsKeyName,
  isKmsConfigured: mocks.isKmsConfigured,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue({ user: { id: 'u1' } });
  mocks.encryptWithKms.mockResolvedValue('ciphertext');
  mocks.getKmsKeyName.mockReturnValue('projects/p/locations/l/keyRings/r/cryptoKeys/k');
  mocks.isKmsConfigured.mockReturnValue(true);
  mocks.readGCSJSON.mockResolvedValue({
    athlete_id: '0',
    api_key_ciphertext: 'ciphertext',
    kms_key_name: 'projects/p/locations/l/keyRings/r/cryptoKeys/k',
    updated_at: '2026-05-02T00:00:00Z',
    status: 'configured',
  });
});

describe('resolveIntervalsIcuSaveError', () => {
  it('returns an actionable error when KMS_KEY_NAME is missing', () => {
    const result = resolveIntervalsIcuSaveError(new Error('KMS_KEY_NAME is not set'));
    expect(result.status).toBe(503);
    expect(result.message).toContain('KMS_KEY_NAME');
    expect(result.message).toContain('Intervals.icu');
  });

  it('returns an actionable error when KMS encryption fails', () => {
    const result = resolveIntervalsIcuSaveError(new Error('KMS encrypt failed: 403'));
    expect(result.status).toBe(502);
    expect(result.message).toContain('KMS');
  });

  it('keeps generic failures terse', () => {
    const result = resolveIntervalsIcuSaveError(new Error('storage write failed'));
    expect(result).toEqual({ message: 'Failed to save Intervals.icu settings', status: 500 });
  });
});

describe('Intervals.icu settings route handlers', () => {
  it('rejects save requests without an API key', async () => {
    const response = await POST(
      new Request('http://localhost/api/settings/intervals-icu', {
        method: 'POST',
        body: JSON.stringify({ athlete_id: '0' }),
      }),
    );
    const data = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe('api_key is required');
    expect(mocks.encryptWithKms).not.toHaveBeenCalled();
    expect(mocks.writeGCSJSON).not.toHaveBeenCalled();
  });

  it('saves encrypted API keys without returning the secret', async () => {
    const response = await POST(
      new Request('http://localhost/api/settings/intervals-icu', {
        method: 'POST',
        body: JSON.stringify({ api_key: ' secret ', athlete_id: '' }),
      }),
    );
    const data = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(mocks.encryptWithKms).toHaveBeenCalledWith('secret');
    expect(mocks.writeGCSJSON).toHaveBeenCalledWith(
      'users/u1/integrations/intervals_icu.json',
      expect.objectContaining({ athlete_id: '0', api_key_ciphertext: 'ciphertext' }),
    );
    expect(data.configured).toBe(true);
    expect(data.api_key).toBeUndefined();
  });

  it('tests saved credentials through the agent and stores verification', async () => {
    mocks.agentFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: 'verified',
          message: 'Intervals.icu API key verified',
        }),
      ),
    );

    const response = await PUT();
    const data = (await response.json()) as { verification?: { status?: string } };

    expect(response.status).toBe(200);
    expect(mocks.agentFetch).toHaveBeenCalledWith(
      '/api/agent/intervals-icu/test',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(data.verification?.status).toBe('verified');
    expect(mocks.writeGCSJSON).toHaveBeenCalledWith(
      'users/u1/integrations/intervals_icu.json',
      expect.objectContaining({
        verification: expect.objectContaining({ status: 'verified' }),
      }),
    );
    expect(mocks.recordAgentOperationLog).toHaveBeenCalled();
  });

  it('maps an unreachable agent check to skipped verification', async () => {
    mocks.agentFetch.mockRejectedValue(new Error('connection refused'));

    const response = await PUT();
    const data = (await response.json()) as { verification?: { status?: string } };

    expect(response.status).toBe(200);
    expect(data.verification?.status).toBe('skipped');
  });

  it('deletes saved credentials', async () => {
    const response = await DELETE();
    const data = (await response.json()) as { configured?: boolean };

    expect(response.status).toBe(200);
    expect(data.configured).toBe(false);
    expect(mocks.deleteGCSObject).toHaveBeenCalledWith('users/u1/integrations/intervals_icu.json');
  });
});

describe('Intervals.icu verification operation logs', () => {
  it('uses completed status for verified connection checks', () => {
    const verification = {
      ok: true,
      status: 'verified' as const,
      message: 'Intervals.icu API key verified',
      checked_at: '2026-05-02T00:00:00Z',
    };

    expect(intervalsIcuVerificationLogStatus(verification)).toBe('completed');
    expect(intervalsIcuVerificationLogMessage(verification, 'test')).toContain('succeeded');
  });

  it('reports missing credentials in the log message', () => {
    const verification = {
      ok: false,
      status: 'missing' as const,
      message: 'Intervals.icu API key is not configured',
      checked_at: '2026-05-02T00:00:00Z',
    };

    expect(intervalsIcuVerificationLogStatus(verification)).toBe('error');
    expect(intervalsIcuVerificationLogMessage(verification)).toContain('API key');
  });
});

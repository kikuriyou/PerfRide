import { describe, expect, it, vi } from 'vitest';
import { submitAppend } from '../_lib/append';

function makeResponse(init: { ok: boolean; status?: number; body: unknown }): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: async () => init.body,
  } as Response;
}

const baseBody = {
  session_date: '2026-04-25',
  session_type: 'endurance',
  duration_minutes: 60,
  target_tss: 40,
  expected_plan_revision: 3,
};

describe('submitAppend', () => {
  it('returns ok with the new plan_revision on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        body: { status: 'success', plan_revision: 4, appended_session: { date: '2026-04-25' } },
      }),
    );

    const result = await submitAppend(baseBody, fetchMock);
    expect(result.status).toBe('ok');
    expect(result.planRevision).toBe(4);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/weekly-plan/append',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('flags conflict and surfaces current_plan_revision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        body: {
          status: 'conflict',
          message: 'stale plan revision',
          current_plan_revision: 5,
        },
      }),
    );

    const result = await submitAppend(baseBody, fetchMock);
    expect(result.status).toBe('conflict');
    expect(result.currentPlanRevision).toBe(5);
    expect(result.message).toBe('stale plan revision');
  });

  it('flags HTTP 409 as conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: false,
        status: 409,
        body: {
          status: 'conflict',
          message: 'stale plan revision',
          current_plan_revision: 5,
        },
      }),
    );

    const result = await submitAppend(baseBody, fetchMock);
    expect(result.status).toBe('conflict');
    expect(result.currentPlanRevision).toBe(5);
  });

  it('returns error with API-provided message on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: false,
        status: 400,
        body: { error: 'session_date is outside the current weekly plan window' },
      }),
    );

    const result = await submitAppend(baseBody, fetchMock);
    expect(result.status).toBe('error');
    expect(result.message).toContain('outside');
  });

  it('returns error when fetch itself rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await submitAppend(baseBody, fetchMock);
    expect(result.status).toBe('error');
    expect(result.message).toBe('offline');
  });
});

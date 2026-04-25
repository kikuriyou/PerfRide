import { describe, expect, it, vi } from 'vitest';
import {
  forwardAppendToAgent,
  isAppendRequestBody,
  type AppendRequestBody,
} from '../route';

function makeResponse(init: { ok: boolean; status?: number; body: unknown }): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: async () => init.body,
  } as Response;
}

const validBody: AppendRequestBody = {
  session_date: '2026-04-25',
  session_type: 'endurance',
  duration_minutes: 60,
  target_tss: 40,
  expected_plan_revision: 3,
};

describe('isAppendRequestBody', () => {
  it('accepts a fully-formed body', () => {
    expect(isAppendRequestBody(validBody)).toBe(true);
  });

  it('accepts an optional notes string', () => {
    expect(isAppendRequestBody({ ...validBody, notes: 'easy' })).toBe(true);
  });

  it('rejects when a required field is missing', () => {
    const { session_type: _omit, ...withoutType } = validBody;
    void _omit;
    expect(isAppendRequestBody(withoutType)).toBe(false);
  });

  it('rejects when notes is not a string', () => {
    expect(isAppendRequestBody({ ...validBody, notes: 123 })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isAppendRequestBody(null)).toBe(false);
    expect(isAppendRequestBody('whatever')).toBe(false);
  });
});

describe('forwardAppendToAgent', () => {
  it('forwards the body to the agent and returns its payload on 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        body: { status: 'success', plan_revision: 5 },
      }),
    );

    const outcome = await forwardAppendToAgent(validBody, 'http://agent', fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://agent/api/agent/weekly-plan/append',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(outcome.status).toBe(200);
    expect(outcome.payload).toEqual({ status: 'success', plan_revision: 5 });
  });

  it('passes through non-2xx status with the agent detail message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: false,
        status: 400,
        body: { detail: 'session_date 2026-05-15 is outside the current weekly plan window' },
      }),
    );

    const outcome = await forwardAppendToAgent(validBody, 'http://agent', fetchMock);

    expect(outcome.status).toBe(400);
    expect((outcome.payload as { error: string }).error).toContain('outside');
  });

  it('returns 502 with a descriptive error when the agent is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'));
    const outcome = await forwardAppendToAgent(validBody, 'http://agent', fetchMock);
    expect(outcome.status).toBe(502);
    expect((outcome.payload as { error: string }).error).toMatch(/agent service/);
  });
});

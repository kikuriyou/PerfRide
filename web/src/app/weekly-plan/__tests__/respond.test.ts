import { describe, expect, it, vi } from 'vitest';
import { buildRespondBody, submitWeeklyResponse } from '../_lib/respond';

function makeResponse(init: { ok: boolean; status?: number; body: unknown }): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: async () => init.body,
  } as Response;
}

describe('buildRespondBody', () => {
  it('drops user_message for approve / dismiss', () => {
    expect(buildRespondBody('weekly_2026-04-20', 3, 'approve')).toEqual({
      review_id: 'weekly_2026-04-20',
      action: 'approve',
      expected_plan_revision: 3,
    });
    expect(buildRespondBody('weekly_2026-04-20', 3, 'dismiss', 'ignored')).toEqual({
      review_id: 'weekly_2026-04-20',
      action: 'dismiss',
      expected_plan_revision: 3,
    });
  });

  it('attaches trimmed user_message for modify when non-empty', () => {
    const body = buildRespondBody('weekly_2026-04-20', 3, 'modify', '  please ease tuesday  ');
    expect(body.user_message).toBe('please ease tuesday');
  });

  it('omits user_message for modify when blank', () => {
    const body = buildRespondBody('weekly_2026-04-20', 3, 'modify', '   ');
    expect(body.user_message).toBeUndefined();
  });
});

describe('submitWeeklyResponse', () => {
  it('returns ok on a successful 2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ ok: true, body: { status: 'approved', plan_revision: 4 } }),
    );

    const result = await submitWeeklyResponse(
      buildRespondBody('weekly_2026-04-20', 3, 'approve'),
      fetchMock,
    );

    expect(result.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/weekly-plan/respond',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('flags the conflict status separately so the caller can re-fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: true,
        body: { status: 'conflict', message: 'stale plan revision' },
      }),
    );

    const result = await submitWeeklyResponse(
      buildRespondBody('weekly_2026-04-20', 3, 'approve'),
      fetchMock,
    );

    expect(result.status).toBe('conflict');
    expect(result.message).toBe('stale plan revision');
  });

  it('flags HTTP 409 as conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        ok: false,
        status: 409,
        body: { status: 'conflict', message: 'stale plan revision' },
      }),
    );

    const result = await submitWeeklyResponse(
      buildRespondBody('weekly_2026-04-20', 3, 'approve'),
      fetchMock,
    );

    expect(result.status).toBe('conflict');
    expect(result.message).toBe('stale plan revision');
  });

  it('returns error with the API-provided message on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ ok: false, status: 500, body: { error: 'agent down' } }),
    );

    const result = await submitWeeklyResponse(
      buildRespondBody('weekly_2026-04-20', 3, 'approve'),
      fetchMock,
    );

    expect(result.status).toBe('error');
    expect(result.message).toBe('agent down');
  });

  it('returns error when fetch itself rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await submitWeeklyResponse(
      buildRespondBody('weekly_2026-04-20', 3, 'approve'),
      fetchMock,
    );

    expect(result.status).toBe('error');
    expect(result.message).toBe('network down');
  });
});

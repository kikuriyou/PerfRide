import { describe, expect, it } from 'vitest';
import { unwrapAgentPayload } from '../route';

describe('unwrapAgentPayload', () => {
  it('passes through HTTP 409 conflict payloads', () => {
    const outcome = unwrapAgentPayload(409, {
      detail: {
        status: 'conflict',
        message: 'stale plan revision',
        current_plan_revision: 8,
      },
    });

    expect(outcome.status).toBe(409);
    expect(outcome.payload).toEqual({
      status: 'conflict',
      message: 'stale plan revision',
      current_plan_revision: 8,
    });
  });

  it('keeps successful payloads at HTTP 200', () => {
    expect(unwrapAgentPayload(202, { status: 'approved' })).toEqual({
      status: 200,
      payload: { status: 'approved' },
    });
  });
});

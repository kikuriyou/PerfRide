import { describe, expect, it } from 'vitest';
import { isReplaceRequestBody, type ReplaceRequestBody } from '../route';

const validBody: ReplaceRequestBody = {
  target_session_id: 'baseline:2026-04-27:2026-04-27',
  session_date: '2026-04-27',
  session_type: 'endurance',
  duration_minutes: 60,
  target_tss: 45,
  expected_plan_revision: 7,
};

describe('isReplaceRequestBody', () => {
  it('accepts a fully-formed replace body', () => {
    expect(isReplaceRequestBody(validBody)).toBe(true);
  });

  it('accepts optional notes, workout_id, and status', () => {
    expect(
      isReplaceRequestBody({
        ...validBody,
        notes: 'keep it aerobic',
        workout_id: 'zwift-123',
        status: 'registered',
      }),
    ).toBe(true);
  });

  it('requires target_session_id and expected_plan_revision', () => {
    const { target_session_id: _target, ...withoutTarget } = validBody;
    const { expected_plan_revision: _revision, ...withoutRevision } = validBody;
    void _target;
    void _revision;
    expect(isReplaceRequestBody(withoutTarget)).toBe(false);
    expect(isReplaceRequestBody(withoutRevision)).toBe(false);
  });

  it('rejects invalid optional field types', () => {
    expect(isReplaceRequestBody({ ...validBody, workout_id: 123 })).toBe(false);
    expect(isReplaceRequestBody({ ...validBody, status: 123 })).toBe(false);
  });
});

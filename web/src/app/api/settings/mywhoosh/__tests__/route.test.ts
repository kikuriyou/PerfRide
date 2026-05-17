import { describe, expect, it } from 'vitest';

import {
  myWhooshVerificationLogMessage,
  myWhooshVerificationLogStatus,
  resolveMyWhooshSaveError,
} from '../route';

describe('resolveMyWhooshSaveError', () => {
  it('returns an actionable error when KMS_KEY_NAME is missing', () => {
    const result = resolveMyWhooshSaveError(new Error('KMS_KEY_NAME is not set'));
    expect(result.status).toBe(503);
    expect(result.message).toContain('KMS_KEY_NAME');
  });

  it('returns an actionable error when KMS encryption fails', () => {
    const result = resolveMyWhooshSaveError(new Error('KMS encrypt failed: 403'));
    expect(result.status).toBe(502);
    expect(result.message).toContain('KMS');
  });

  it('keeps generic failures terse', () => {
    const result = resolveMyWhooshSaveError(new Error('storage write failed'));
    expect(result).toEqual({ message: 'Failed to save MyWhoosh settings', status: 500 });
  });
});

describe('MyWhoosh verification operation logs', () => {
  it('shows already logged in failures in the log message', () => {
    const verification = {
      ok: false,
      status: 'already_logged_in' as const,
      message: 'MyWhoosh account is already logged in from another device.',
      checked_at: '2026-05-02T00:00:00Z',
    };

    expect(myWhooshVerificationLogStatus(verification)).toBe('error');
    expect(myWhooshVerificationLogMessage(verification)).toContain('another device');
    expect(myWhooshVerificationLogMessage(verification)).toContain('already logged in');
  });
});

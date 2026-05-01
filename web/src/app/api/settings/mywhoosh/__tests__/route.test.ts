import { describe, expect, it } from 'vitest';

import { resolveMyWhooshSaveError } from '../route';

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

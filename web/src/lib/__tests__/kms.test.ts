import { afterEach, describe, expect, it, vi } from 'vitest';

import { getKmsKeyName, isKmsConfigured } from '@/lib/kms';

describe('KMS helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires KMS_KEY_NAME', () => {
    vi.stubEnv('KMS_KEY_NAME', '');
    expect(isKmsConfigured()).toBe(false);
    expect(() => getKmsKeyName()).toThrow(/KMS_KEY_NAME/);
  });

  it('returns configured key name', () => {
    vi.stubEnv('KMS_KEY_NAME', 'projects/p/locations/l/keyRings/r/cryptoKeys/k');
    expect(isKmsConfigured()).toBe(true);
    expect(getKmsKeyName()).toBe('projects/p/locations/l/keyRings/r/cryptoKeys/k');
  });
});

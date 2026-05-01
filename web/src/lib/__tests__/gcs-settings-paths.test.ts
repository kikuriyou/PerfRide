import { describe, expect, it } from 'vitest';

import { normalizeGcsUserId, userObjectPath } from '@/lib/gcs-settings';

describe('GCS user paths', () => {
  it('builds user-scoped object paths', () => {
    expect(userObjectPath(123, 'settings.json')).toBe('users/123/settings.json');
    expect(userObjectPath('athlete-1', '/integrations/mywhoosh.json')).toBe(
      'users/athlete-1/integrations/mywhoosh.json',
    );
  });

  it('rejects unsafe user ids', () => {
    expect(() => normalizeGcsUserId('../123')).toThrow(/Invalid/);
  });
});

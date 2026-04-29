import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CACHE_KEY,
  loadCachedRecommendation,
  saveCachedRecommendation,
  shouldReadCache,
  shouldWriteCache,
  type Recommendation,
} from '../recommendCache';

type Store = Map<string, string>;

function createLocalStorageStub() {
  const store: Store = new Map();
  const getItem = vi.fn((k: string) => (store.has(k) ? store.get(k)! : null));
  const setItem = vi.fn((k: string, v: string) => {
    store.set(k, v);
  });
  const removeItem = vi.fn((k: string) => {
    store.delete(k);
  });
  const clear = vi.fn(() => {
    store.clear();
  });
  return {
    store,
    stub: { getItem, setItem, removeItem, clear, length: 0, key: () => null },
    getItem,
    setItem,
    removeItem,
  };
}

const sampleRec: Recommendation = {
  summary: 'test summary',
  detail: 'test detail',
  created_at: '2026-04-10T08:00:00Z',
  from_cache: false,
  plan_context_key: 'coach:2026-04-07:3:approved',
};

describe('shouldReadCache', () => {
  it('returns true only when no forceRefresh, no constraint, no asOf', () => {
    expect(shouldReadCache(null, false, false)).toBe(true);
  });
  it('returns false when asOf is set', () => {
    expect(shouldReadCache('2026-04-10T22:00', false, false)).toBe(false);
  });
  it('returns false when forceRefresh is true', () => {
    expect(shouldReadCache(null, true, false)).toBe(false);
  });
  it('returns false when constraint is present', () => {
    expect(shouldReadCache(null, false, true)).toBe(false);
  });
});

describe('shouldWriteCache', () => {
  it('returns true when no asOf and no constraint', () => {
    expect(shouldWriteCache(null, false)).toBe(true);
  });
  it('returns false when asOf is set', () => {
    expect(shouldWriteCache('2026-04-10T22:00', false)).toBe(false);
  });
  it('returns false when constraint is present', () => {
    expect(shouldWriteCache(null, true)).toBe(false);
  });
});

describe('cache helpers do not touch localStorage when bypassed', () => {
  let storage: ReturnType<typeof createLocalStorageStub>;

  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage.stub);
  });

  it('saveCachedRecommendation is not invoked when asOf is set', () => {
    const asOf = '2026-04-10T22:00';
    const hasConstraint = false;
    if (shouldWriteCache(asOf, hasConstraint)) {
      saveCachedRecommendation(
        sampleRec,
        'hybrid',
        true,
        250,
        'coach',
        sampleRec.plan_context_key ?? null,
      );
    }
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.store.size).toBe(0);
  });

  it('loadCachedRecommendation is not invoked when asOf is set', () => {
    const asOf = '2026-04-10T22:00';
    if (shouldReadCache(asOf, false, false)) {
      loadCachedRecommendation('hybrid', true, 250, 'coach', sampleRec.plan_context_key ?? null);
    }
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('saveCachedRecommendation writes to localStorage when asOf is null', () => {
    const asOf = null;
    const hasConstraint = false;
    if (shouldWriteCache(asOf, hasConstraint)) {
      saveCachedRecommendation(
        sampleRec,
        'hybrid',
        true,
        250,
        'coach',
        sampleRec.plan_context_key ?? null,
      );
    }
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith(CACHE_KEY, expect.any(String));
  });

  it('saveCachedRecommendation is not invoked when a constraint is active', () => {
    const asOf = null;
    const hasConstraint = true;
    if (shouldWriteCache(asOf, hasConstraint)) {
      saveCachedRecommendation(
        sampleRec,
        'hybrid',
        true,
        250,
        'coach',
        sampleRec.plan_context_key ?? null,
      );
    }
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('loadCachedRecommendation', () => {
  let storage: ReturnType<typeof createLocalStorageStub>;

  beforeEach(() => {
    storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage.stub);
  });

  it('returns null when cache is empty', () => {
    expect(
      loadCachedRecommendation('hybrid', true, 250, 'coach', sampleRec.plan_context_key ?? null),
    ).toBeNull();
  });

  it('returns cached entry when fresh and matching signature', () => {
    saveCachedRecommendation(
      sampleRec,
      'hybrid',
      true,
      250,
      'coach',
      sampleRec.plan_context_key ?? null,
    );
    const loaded = loadCachedRecommendation(
      'hybrid',
      true,
      250,
      'coach',
      sampleRec.plan_context_key ?? null,
    );
    expect(loaded).not.toBeNull();
    expect(loaded?.summary).toBe(sampleRec.summary);
  });

  it('returns null when ftp differs (signature mismatch)', () => {
    saveCachedRecommendation(
      sampleRec,
      'hybrid',
      true,
      250,
      'coach',
      sampleRec.plan_context_key ?? null,
    );
    expect(
      loadCachedRecommendation('hybrid', true, 300, 'coach', sampleRec.plan_context_key ?? null),
    ).toBeNull();
  });

  it('returns null when plan_context_key differs', () => {
    saveCachedRecommendation(
      sampleRec,
      'hybrid',
      true,
      250,
      'coach',
      sampleRec.plan_context_key ?? null,
    );
    expect(
      loadCachedRecommendation('hybrid', true, 250, 'coach', 'coach:2026-04-14:4:approved'),
    ).toBeNull();
  });
});

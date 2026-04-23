import type { RecommendMode } from '@/lib/settings';
import type { WorkoutInterval } from '@/types/workout';

export const CACHE_KEY = 'perfride_recommendation_cache';
export const CACHE_TTL_MS = 30 * 60 * 1000;

export interface Recommendation {
  summary: string;
  detail: string;
  created_at: string;
  from_cache: boolean;
  workout_intervals?: WorkoutInterval[];
  totalDurationMin?: number;
  workoutName?: string;
  references?: { title: string; url: string | null }[];
  why_now?: string;
  based_on?: string;
}

export interface CachedRecommendationEntry extends Recommendation {
  _cachedAt: number;
  _recommendMode: RecommendMode;
  _usePersonalData: boolean;
  _ftp: number;
}

export function shouldReadCache(
  asOf: string | null,
  forceRefresh: boolean,
  hasConstraint: boolean,
): boolean {
  return !forceRefresh && !hasConstraint && !asOf;
}

export function shouldWriteCache(asOf: string | null, hasConstraint: boolean): boolean {
  return !hasConstraint && !asOf;
}

export function loadCachedRecommendation(
  recommendMode: RecommendMode,
  usePersonalData: boolean,
  ftp: number,
): Recommendation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedRecommendationEntry>;
    const age = Date.now() - (cached._cachedAt || 0);
    if (age > CACHE_TTL_MS) return null;
    if (
      cached._recommendMode !== recommendMode ||
      cached._usePersonalData !== usePersonalData ||
      cached._ftp !== ftp
    ) {
      return null;
    }
    return cached as Recommendation;
  } catch {
    return null;
  }
}

export function saveCachedRecommendation(
  rec: Recommendation,
  recommendMode: RecommendMode,
  usePersonalData: boolean,
  ftp: number,
): void {
  try {
    const entry: CachedRecommendationEntry = {
      ...rec,
      _cachedAt: Date.now(),
      _recommendMode: recommendMode,
      _usePersonalData: usePersonalData,
      _ftp: ftp,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable
  }
}

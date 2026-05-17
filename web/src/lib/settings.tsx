'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  DEFAULT_WEEKLY_SCHEDULE,
  type CoachAutonomy,
  type DayName,
  type GCSUserSettings,
  type UserLocale,
  type WeeklySchedule,
} from '@/lib/gcs-schema';

export type { CoachAutonomy, UserLocale } from '@/lib/gcs-schema';

export type RecommendMode = 'hybrid' | 'web_only' | 'no_grounding';
export type GoalType =
  | 'hillclimb_tt'
  | 'road_race'
  | 'ftp_improvement'
  | 'fitness_maintenance'
  | 'other';

export interface UserSettings {
  ftp: number;
  weight: number;
  maxHR: number;
  goal: GoalType;
  goalCustom: string;
  goalDate: string | null;
  recommendMode: RecommendMode;
  usePersonalData: boolean;
  coachAutonomy: CoachAutonomy;
  locale: UserLocale;
  timezone: string;
  weeklySchedule: WeeklySchedule;
  asOf: string | null;
}

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  isLoaded: boolean;
}

const DAY_NAMES: DayName[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const FALLBACK_TIMEZONE = 'Asia/Tokyo';

const defaultSettings: UserSettings = {
  ftp: 200,
  weight: 70,
  maxHR: 185,
  goal: 'fitness_maintenance',
  goalCustom: '',
  goalDate: null,
  recommendMode: 'hybrid',
  usePersonalData: true,
  coachAutonomy: 'suggest',
  locale: 'ja',
  timezone: FALLBACK_TIMEZONE,
  weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
  asOf: null,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function syncFtpCookie(ftp: number) {
  document.cookie = `perfride_ftp=${ftp}; path=/; max-age=31536000; SameSite=Lax`;
}

function syncAsOfCookie(asOf: string | null) {
  if (!asOf) {
    document.cookie = 'perfride_as_of=; path=/; max-age=0; SameSite=Lax';
    return;
  }
  document.cookie = `perfride_as_of=${encodeURIComponent(
    asOf,
  )}; path=/; max-age=31536000; SameSite=Lax`;
}

function browserTimezone(): string {
  if (typeof window === 'undefined') return FALLBACK_TIMEZONE;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
}

function normalizeLocale(value: unknown): UserLocale {
  return value === 'en' || value === 'ja' ? value : defaultSettings.locale;
}

function normalizeTimezone(value: unknown): string {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : browserTimezone();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return browserTimezone();
  }
}

function normalizeWeeklySchedule(input?: Partial<WeeklySchedule> | null): WeeklySchedule {
  return DAY_NAMES.reduce<WeeklySchedule>((acc, dayName) => {
    const source = input?.[dayName];
    acc[dayName] = {
      available: source?.available ?? DEFAULT_WEEKLY_SCHEDULE[dayName].available,
      max_minutes: source?.max_minutes ?? DEFAULT_WEEKLY_SCHEDULE[dayName].max_minutes,
      time_slot: source?.time_slot,
    };
    return acc;
  }, {} as WeeklySchedule);
}

function mapGcsToSettings(gcs: GCSUserSettings): UserSettings {
  const goalType =
    gcs.goal?.type === 'hillclimb_tt' ||
    gcs.goal?.type === 'road_race' ||
    gcs.goal?.type === 'ftp_improvement' ||
    gcs.goal?.type === 'fitness_maintenance' ||
    gcs.goal?.type === 'other'
      ? gcs.goal.type
      : 'fitness_maintenance';
  return {
    ftp: gcs.ftp ?? defaultSettings.ftp,
    weight: gcs.weight_kg ?? defaultSettings.weight,
    maxHR: gcs.max_hr ?? defaultSettings.maxHR,
    goal: goalType,
    goalCustom: gcs.goal?.name ?? '',
    goalDate: gcs.goal?.date ?? null,
    recommendMode: defaultSettings.recommendMode,
    usePersonalData: defaultSettings.usePersonalData,
    coachAutonomy: gcs.coach_autonomy ?? defaultSettings.coachAutonomy,
    locale: normalizeLocale(gcs.locale),
    timezone: normalizeTimezone(gcs.timezone),
    weeklySchedule: normalizeWeeklySchedule(gcs.training_preference?.weekly_schedule),
    asOf: null,
  };
}

function loadLocalSettings(): UserSettings {
  if (typeof window === 'undefined') return defaultSettings;
  const saved = localStorage.getItem('userSettings');
  if (!saved) {
    return { ...defaultSettings, timezone: browserTimezone() };
  }
  try {
    const parsed = JSON.parse(saved) as Partial<UserSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      locale: normalizeLocale(parsed.locale),
      timezone: normalizeTimezone(parsed.timezone),
      goalCustom: parsed.goalCustom ?? '',
      goalDate: parsed.goalDate ?? null,
      weeklySchedule: normalizeWeeklySchedule(parsed.weeklySchedule),
      asOf: parsed.asOf ?? null,
    };
  } catch {
    return defaultSettings;
  }
}

function mergeServerSettings(local: UserSettings, remote: UserSettings): UserSettings {
  return {
    ...local,
    ...remote,
    locale: remote.locale,
    timezone: remote.timezone || local.timezone,
    weeklySchedule: normalizeWeeklySchedule(remote.weeklySchedule),
    asOf: local.asOf,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const syncReady = useRef(false);

  useEffect(() => {
    syncFtpCookie(settings.ftp);
  }, [settings.ftp]);

  useEffect(() => {
    syncAsOfCookie(settings.asOf);
  }, [settings.asOf]);

  useEffect(() => {
    let cancelled = false;
    const local = loadLocalSettings();
    setSettings(local);
    async function hydrateFromServer() {
      try {
        const res = await fetch('/api/settings/sync', { method: 'GET' });
        if (!res.ok) throw new Error('settings fetch failed');
        const data = (await res.json()) as { settings?: GCSUserSettings | null };
        if (cancelled) return;
        const remoteSettings = data.settings;
        if (remoteSettings) {
          setSettings((prev) => mergeServerSettings(prev, mapGcsToSettings(remoteSettings)));
        }
      } catch {
        // use local fallback
      } finally {
        if (!cancelled) {
          setIsLoaded(true);
        }
      }
    }
    hydrateFromServer().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('userSettings', JSON.stringify(settings));
    syncFtpCookie(settings.ftp);
    if (!syncReady.current) {
      syncReady.current = true;
      return;
    }
    fetch('/api/settings/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => {});
  }, [settings, isLoaded]);

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings((prev) => {
      const shouldClearCache =
        (newSettings.ftp !== undefined && newSettings.ftp !== prev.ftp) ||
        (newSettings.goal !== undefined && newSettings.goal !== prev.goal) ||
        (newSettings.goalCustom !== undefined && newSettings.goalCustom !== prev.goalCustom) ||
        (newSettings.recommendMode !== undefined &&
          newSettings.recommendMode !== prev.recommendMode) ||
        (newSettings.usePersonalData !== undefined &&
          newSettings.usePersonalData !== prev.usePersonalData) ||
        (newSettings.coachAutonomy !== undefined &&
          newSettings.coachAutonomy !== prev.coachAutonomy) ||
        (newSettings.locale !== undefined && newSettings.locale !== prev.locale) ||
        (newSettings.timezone !== undefined && newSettings.timezone !== prev.timezone);
      if (shouldClearCache) {
        try {
          localStorage.removeItem('perfride_recommendation_cache');
        } catch {
          // ignore
        }
      }
      return {
        ...prev,
        ...newSettings,
        locale: normalizeLocale(newSettings.locale ?? prev.locale),
        timezone: normalizeTimezone(newSettings.timezone ?? prev.timezone),
        weeklySchedule: normalizeWeeklySchedule(newSettings.weeklySchedule ?? prev.weeklySchedule),
      };
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoaded }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

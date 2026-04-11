'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type RecommendMode = 'hybrid' | 'web_only' | 'no_grounding';

interface UserSettings {
  ftp: number;
  weight: number;
  maxHR: number;
  goal: 'hillclimb_tt' | 'road_race' | 'ftp_improvement' | 'fitness_maintenance' | 'other';
  goalCustom?: string;
  recommendMode: RecommendMode;
  usePersonalData: boolean;
}

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
}

const defaultSettings: UserSettings = {
  ftp: 200,
  weight: 70,
  maxHR: 185,
  goal: 'fitness_maintenance',
  goalCustom: '',
  recommendMode: 'hybrid',
  usePersonalData: true,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function syncFtpCookie(ftp: number) {
  document.cookie = `perfride_ftp=${ftp}; path=/; max-age=31536000; SameSite=Lax`;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('userSettings');
    if (saved) {
      try {
        const parsed = { ...defaultSettings, ...JSON.parse(saved) } as UserSettings;
        setSettings(parsed);
        syncFtpCookie(parsed.ftp);
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('userSettings', JSON.stringify(settings));
      syncFtpCookie(settings.ftp);
    }
  }, [settings, isLoaded]);

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
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

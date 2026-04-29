import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import {
  type CoachAutonomy,
  type DayName,
  type GCSUserSettings,
  type WeeklySchedule,
} from '@/lib/gcs-schema';
import { DEFAULT_WEEKLY_SCHEDULE } from '@/lib/gcs-schema';
import { readUserSettings, writeUserSettings } from '@/lib/gcs-settings';

interface SyncBody {
  ftp?: number;
  weight?: number;
  maxHR?: number;
  goal?: string;
  goalCustom?: string;
  goalDate?: string | null;
  coachAutonomy?: CoachAutonomy;
  weeklySchedule?: Partial<WeeklySchedule>;
}

const DAY_NAMES: DayName[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function normalizeGoalDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeWeeklySchedule(input?: Partial<WeeklySchedule>): WeeklySchedule {
  return DAY_NAMES.reduce<WeeklySchedule>((acc, dayName) => {
    const day = input?.[dayName];
    acc[dayName] = {
      available: day?.available ?? DEFAULT_WEEKLY_SCHEDULE[dayName].available,
      max_minutes: day?.max_minutes ?? DEFAULT_WEEKLY_SCHEDULE[dayName].max_minutes,
      time_slot: day?.time_slot,
    };
    return acc;
  }, {} as WeeklySchedule);
}

function baseSettings(userId: string): GCSUserSettings {
  return {
    user_id: userId,
    strava_owner_id: Number(userId) || 0,
    coach_autonomy: 'suggest',
    ftp: 200,
    weight_kg: 70,
    max_hr: 185,
    goal: { type: 'fitness_maintenance', name: '', date: null, priority: 'medium' },
    training_preference: {
      mode: 'outdoor_preferred',
      location: { lat: 0, lon: 0 },
      weekly_schedule: DEFAULT_WEEKLY_SCHEDULE,
    },
    strava_auth: { access_token: '', refresh_token: '', expires_at: 0 },
    notification: { channels: [] },
    zwift_id: '',
    updated_at: new Date().toISOString(),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await readUserSettings();
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: SyncBody = await request.json();
    const existing = await readUserSettings();
    const current = existing ?? baseSettings(session.user.id);

    const merged: GCSUserSettings = {
      ...current,
      ftp: body.ftp ?? current.ftp ?? 200,
      weight_kg: body.weight ?? current.weight_kg ?? 70,
      max_hr: body.maxHR ?? current.max_hr ?? 185,
      coach_autonomy: body.coachAutonomy ?? current.coach_autonomy ?? 'suggest',
      goal: {
        ...(current.goal ?? {
          type: 'fitness_maintenance',
          name: '',
          date: null,
          priority: 'medium',
        }),
        type: body.goal ?? current.goal?.type ?? 'fitness_maintenance',
        name: body.goalCustom ?? current.goal?.name ?? '',
        date:
          body.goalDate !== undefined
            ? normalizeGoalDate(body.goalDate)
            : (current.goal?.date ?? null),
      },
      training_preference: {
        ...(current.training_preference ?? {
          mode: 'outdoor_preferred',
          location: { lat: 0, lon: 0 },
          weekly_schedule: DEFAULT_WEEKLY_SCHEDULE,
        }),
        weekly_schedule: normalizeWeeklySchedule(
          body.weeklySchedule ?? current.training_preference?.weekly_schedule,
        ),
      },
      updated_at: new Date().toISOString(),
    };

    await writeUserSettings(merged);

    return NextResponse.json({ ok: true, settings: merged });
  } catch (error) {
    console.error('Settings sync error:', error);
    return NextResponse.json({ error: 'Failed to sync settings' }, { status: 500 });
  }
}

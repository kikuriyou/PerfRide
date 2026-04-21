import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { readUserSettings, writeUserSettings, GCSUserSettings } from '@/lib/gcs-settings';

interface SyncBody {
  ftp?: number;
  weight?: number;
  maxHR?: number;
  goal?: string;
  goalCustom?: string;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: SyncBody = await request.json();
    const existing = await readUserSettings();

    const merged: GCSUserSettings = {
      ...(existing ?? ({} as GCSUserSettings)),
      ftp: body.ftp ?? existing?.ftp ?? 200,
      weight_kg: body.weight ?? existing?.weight_kg ?? 70,
      max_hr: body.maxHR ?? existing?.max_hr ?? 185,
      goal: {
        ...(existing?.goal ?? { date: '', priority: 'medium' }),
        type: body.goal ?? existing?.goal?.type ?? 'fitness_maintenance',
        name: body.goalCustom ?? existing?.goal?.name ?? '',
      },
      updated_at: new Date().toISOString(),
    };

    await writeUserSettings(merged);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Settings sync error:', error);
    return NextResponse.json({ error: 'Failed to sync settings' }, { status: 500 });
  }
}

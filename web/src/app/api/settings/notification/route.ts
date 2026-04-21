import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { readUserSettings, writeUserSettings, GCSUserSettings } from '@/lib/gcs-settings';

interface NotificationBody {
  web_push_subscription?: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  line_user_id?: string;
  channels?: ('web_push' | 'line')[];
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: NotificationBody = await request.json();
    const existing = await readUserSettings();

    if (!existing) {
      return NextResponse.json({ error: 'User settings not found' }, { status: 404 });
    }

    const merged: GCSUserSettings = {
      ...existing,
      notification: {
        ...existing.notification,
        channels: body.channels ?? existing.notification.channels,
        ...(body.web_push_subscription !== undefined && {
          web_push_subscription: body.web_push_subscription,
        }),
        ...(body.line_user_id !== undefined && {
          line_user_id: body.line_user_id,
        }),
      },
      updated_at: new Date().toISOString(),
    };

    await writeUserSettings(merged);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Notification settings error:', error);
    return NextResponse.json({ error: 'Failed to save notification settings' }, { status: 500 });
  }
}

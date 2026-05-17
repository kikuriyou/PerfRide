import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { agentFetch } from '@/lib/agent';
import { authOptions } from '@/lib/auth';
import { readUserSettings } from '@/lib/gcs-settings';

interface RespondBody {
  session_id: string;
  action: 'approve' | 'modify' | 'rest';
  user_message?: string;
  modification_count?: number;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: RespondBody = await request.json();
    const settings = await readUserSettings(session.user.id, { fallbackLegacy: true });
    const resp = await agentFetch('/recommend/respond', {
      method: 'POST',
      body: JSON.stringify({
        ...body,
        user_id: session.user.id,
        locale: settings?.locale ?? 'ja',
        timezone: settings?.timezone ?? 'Asia/Tokyo',
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      return NextResponse.json({ error: `Agent API error: ${error}` }, { status: resp.status });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Respond API error:', error);
    return NextResponse.json(
      { error: 'Failed to send response. Make sure the agent service is running.' },
      { status: 500 },
    );
  }
}

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getActivityStreams } from '@/lib/strava';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const activityId = parseInt(id, 10);

  if (isNaN(activityId)) {
    return NextResponse.json({ error: 'Invalid activity ID' }, { status: 400 });
  }

  try {
    const streams = await getActivityStreams(session.accessToken, activityId, [
      'time',
      'velocity_smooth',
      'heartrate',
      'altitude',
      'watts',
    ]);
    return NextResponse.json(streams);
  } catch (error) {
    console.error('Failed to fetch activity streams:', error);
    return NextResponse.json({ error: 'Failed to fetch activity streams' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getSegmentStreams, getSegmentDetails } from '@/lib/strava';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const segmentId = request.nextUrl.searchParams.get('id');
  if (!segmentId) {
    return NextResponse.json({ error: 'Missing segment id' }, { status: 400 });
  }

  try {
    const [details, streams] = await Promise.all([
      getSegmentDetails(session.accessToken, parseInt(segmentId)),
      getSegmentStreams(session.accessToken, parseInt(segmentId)),
    ]);

    return NextResponse.json({
      id: details.id,
      name: details.name,
      distance: details.distance,
      elevation_gain: details.elevation_high - details.elevation_low,
      average_grade: details.average_grade,
      streams: {
        distance: streams.distance,
        altitude: streams.altitude,
      },
    });
  } catch (error) {
    console.error('Failed to fetch segment streams:', error);
    return NextResponse.json({ error: 'Failed to fetch segment data' }, { status: 500 });
  }
}

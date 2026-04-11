import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { exploreSegments } from '@/lib/strava';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const radius = searchParams.get('radius') || '0.1'; // degrees, ~10km default

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const radiusNum = parseFloat(radius);

  // Ensure radius is reasonable (max ~50km)
  const clampedRadius = Math.min(radiusNum, 0.5);

  // Calculate bounds: [south, west, north, east]
  const bounds: [number, number, number, number] = [
    latNum - clampedRadius,
    lngNum - clampedRadius,
    latNum + clampedRadius,
    lngNum + clampedRadius,
  ];

  try {
    const segments = await exploreSegments(session.accessToken, bounds);
    console.log(`Segments found: ${segments.length} for bounds: [${bounds.join(', ')}]`);
    return NextResponse.json({ segments });
  } catch (error) {
    console.error('Failed to explore segments:', error);
    return NextResponse.json({ error: 'Failed to explore segments' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { readUserSettings, writeUserSettings } from '@/lib/gcs-settings';
import type { GCSUserSettings } from '@/lib/gcs-settings';
import { exploreSegments } from '@/lib/strava';

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

async function getValidAccessToken(
  settings: GCSUserSettings,
): Promise<{ token: string; settings: GCSUserSettings }> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (settings.strava_auth.expires_at < nowSec + 60) {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID!,
        client_secret: process.env.STRAVA_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: settings.strava_auth.refresh_token,
      }),
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed: ${res.status} ${res.statusText}`);
    }

    const tokens: StravaTokenResponse = await res.json();
    const updated: GCSUserSettings = {
      ...settings,
      strava_auth: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
      },
      updated_at: new Date().toISOString(),
    };
    await writeUserSettings(updated);
    return { token: updated.strava_auth.access_token, settings: updated };
  }
  return { token: settings.strava_auth.access_token, settings };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const radius = searchParams.get('radius') || '0.1';

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const settings = await readUserSettings();
  if (!settings) {
    return NextResponse.json({ error: 'No user settings found' }, { status: 500 });
  }

  const { token } = await getValidAccessToken(settings);

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const radiusNum = parseFloat(radius);
  const clampedRadius = Math.min(radiusNum, 0.5);

  const bounds: [number, number, number, number] = [
    latNum - clampedRadius,
    lngNum - clampedRadius,
    latNum + clampedRadius,
    lngNum + clampedRadius,
  ];

  try {
    const segments = await exploreSegments(token, bounds);
    return NextResponse.json({ segments });
  } catch (error) {
    console.error('Failed to explore segments:', error);
    return NextResponse.json({ error: 'Failed to explore segments' }, { status: 500 });
  }
}

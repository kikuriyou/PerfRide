import { NextRequest, NextResponse } from 'next/server';

// Using Nominatim (OpenStreetMap) for geocoding - free and no API key required
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=5`, {
      headers: {
        'User-Agent': 'AntigravityApp/1.0',
      },
    });

    if (!res.ok) {
      throw new Error(`Geocoding failed: ${res.statusText}`);
    }

    const data = await res.json();

    const results = data.map((item: Record<string, string>) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Geocoding error:', error);
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 });
  }
}

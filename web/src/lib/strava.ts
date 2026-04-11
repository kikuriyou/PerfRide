const STRAVA_API_URL = 'https://www.strava.com/api/v3';

export interface StravaSegment {
  id: number;
  name: string;
  distance: number;
  average_grade: number;
  maximum_grade: number;
  elevation_high: number;
  elevation_low: number;
  start_latlng: [number, number];
  end_latlng: [number, number];
  climb_category: number;
  city: string;
  state: string;
  country: string;
  private: boolean;
  starred: boolean;
}

// Explore segments response has a slightly different structure
export interface ExploreSegment {
  id: number;
  name: string;
  climb_category: number;
  climb_category_desc: string;
  avg_grade: number;
  start_latlng: [number, number];
  end_latlng: [number, number];
  elev_difference: number;
  distance: number;
  points: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  average_speed: number; // m/s
  max_speed: number; // m/s
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  suffer_score?: number;
}

export interface AthleteStats {
  recent_ride_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    elevation_gain: number;
  };
  ytd_ride_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    elevation_gain: number;
  };
  all_ride_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    elevation_gain: number;
  };
}

export async function getStarredSegments(accessToken: string, page = 1): Promise<StravaSegment[]> {
  const res = await fetch(`${STRAVA_API_URL}/segments/starred?page=${page}&per_page=30`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch segments: ${res.statusText}`);
  }

  return res.json();
}

export async function getSegmentDetails(
  accessToken: string,
  segmentId: number,
): Promise<StravaSegment> {
  const res = await fetch(`${STRAVA_API_URL}/segments/${segmentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch segment details: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Explore segments in a given area
 * @param accessToken - Strava access token
 * @param bounds - [south_lat, west_lng, north_lat, east_lng]
 * @param activityType - 'riding' or 'running' (default: 'riding')
 * @param minClimbCategory - minimum climb category (0-5, default: 0)
 * @param maxClimbCategory - maximum climb category (0-5, default: 5)
 */
export async function exploreSegments(
  accessToken: string,
  bounds: [number, number, number, number],
  activityType: 'riding' | 'running' = 'riding',
  minClimbCategory = 0,
  maxClimbCategory = 5,
): Promise<ExploreSegment[]> {
  const boundsStr = bounds.join(',');
  const url = `${STRAVA_API_URL}/segments/explore?bounds=${boundsStr}&activity_type=${activityType}&min_cat=${minClimbCategory}&max_cat=${maxClimbCategory}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to explore segments: ${res.statusText}`);
  }

  const data = await res.json();
  return data.segments || [];
}

export async function getActivities(
  accessToken: string,
  page = 1,
  perPage = 30,
): Promise<StravaActivity[]> {
  const res = await fetch(`${STRAVA_API_URL}/athlete/activities?page=${page}&per_page=${perPage}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch activities: ${res.statusText}`);
  }

  return res.json();
}

export async function getAthleteStats(
  accessToken: string,
  athleteId: string,
): Promise<AthleteStats> {
  const res = await fetch(`${STRAVA_API_URL}/athletes/${athleteId}/stats`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch athlete stats: ${res.statusText}`);
  }

  return res.json();
}

// Activity Streams for detailed time-series data
export interface ActivityStream {
  time: number[]; // seconds since start
  velocity_smooth?: number[]; // m/s
  heartrate?: number[]; // bpm
  distance?: number[]; // meters
  altitude?: number[]; // meters
  watts?: number[]; // watts (power meter data)
}

export async function getActivityStreams(
  accessToken: string,
  activityId: number,
  streamTypes: string[] = ['time', 'velocity_smooth', 'heartrate'],
): Promise<ActivityStream> {
  const keys = streamTypes.join(',');
  const res = await fetch(
    `${STRAVA_API_URL}/activities/${activityId}/streams?keys=${keys}&key_by_type=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch activity streams: ${res.statusText}`);
  }

  const data = await res.json();

  // Transform the response to our interface
  const result: ActivityStream = {
    time: data.time?.data || [],
  };

  if (data.velocity_smooth) result.velocity_smooth = data.velocity_smooth.data;
  if (data.heartrate) result.heartrate = data.heartrate.data;
  if (data.distance) result.distance = data.distance.data;
  if (data.altitude) result.altitude = data.altitude.data;
  if (data.watts) result.watts = data.watts.data;

  return result;
}

// Helper functions
export function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(1) + ' km';
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatSpeed(metersPerSecond: number): string {
  return (metersPerSecond * 3.6).toFixed(1) + ' km/h';
}

export function formatElevation(meters: number): string {
  return Math.round(meters) + 'm';
}

/**
 * Get climb category description
 */
export function getClimbCategoryLabel(category: number): string {
  switch (category) {
    case 5:
      return 'HC';
    case 4:
      return 'Cat 1';
    case 3:
      return 'Cat 2';
    case 2:
      return 'Cat 3';
    case 1:
      return 'Cat 4';
    default:
      return 'NC';
  }
}

// Segment Streams for elevation profile
export interface SegmentStream {
  distance: number[]; // meters from start
  altitude: number[]; // meters
  latlng?: [number, number][]; // latitude, longitude pairs
}

export async function getSegmentStreams(
  accessToken: string,
  segmentId: number,
): Promise<SegmentStream> {
  const keys = 'distance,altitude,latlng';
  const res = await fetch(
    `${STRAVA_API_URL}/segments/${segmentId}/streams?keys=${keys}&key_by_type=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch segment streams: ${res.statusText}`);
  }

  const data = await res.json();

  return {
    distance: data.distance?.data || [],
    altitude: data.altitude?.data || [],
    latlng: data.latlng?.data,
  };
}

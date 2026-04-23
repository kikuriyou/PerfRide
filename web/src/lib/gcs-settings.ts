export interface GCSUserSettings {
  user_id: string;
  strava_owner_id: number;
  ftp: number;
  weight_kg: number;
  max_hr: number;
  goal: {
    type: string;
    name: string;
    date: string;
    priority: string;
  };
  training_preference: {
    mode: 'indoor_preferred' | 'outdoor_possible' | 'outdoor_preferred';
    location: { lat: number; lon: number };
    weekly_schedule: Record<
      string,
      {
        available: boolean;
        max_minutes?: number;
        time_slot?: string;
      }
    >;
  };
  strava_auth: {
    refresh_token: string;
    access_token: string;
    expires_at: number;
  };
  notification: {
    channels: ('web_push' | 'line')[];
    web_push_subscription?: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    line_user_id?: string;
  };
  zwift_id: string;
  updated_at: string;
}

export interface TrainingSession {
  date: string;
  type: string;
  duration_minutes?: number;
  target_tss?: number;
  status: 'planned' | 'registered' | 'confirmed' | 'completed' | 'skipped' | 'modified';
  actual_tss?: number;
  workout_id?: string;
}

export interface GCSTrainingPlan {
  user_id: string;
  plan_id: string;
  goal_event: string;
  current_phase: string;
  phases: { name: string; start: string; end: string }[];
  weekly_plan: Record<
    string,
    {
      week_number: number;
      phase: string;
      target_tss: number;
      sessions: TrainingSession[];
    }
  >;
  updated_at: string;
  updated_by: string;
}

async function getGCSBucket() {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  return storage.bucket(process.env.GCS_BUCKET!);
}

async function readJSON<T>(path: string): Promise<T | null> {
  try {
    const bucket = await getGCSBucket();
    const blob = bucket.file(path);
    const [exists] = await blob.exists();
    if (!exists) return null;
    const [buf] = await blob.download();
    return JSON.parse(buf.toString('utf-8')) as T;
  } catch {
    return null;
  }
}

async function writeJSON(path: string, data: unknown): Promise<void> {
  const bucket = await getGCSBucket();
  const blob = bucket.file(path);
  await blob.save(JSON.stringify(data, null, 2), {
    contentType: 'application/json',
  });
}

async function appendJSONL(path: string, record: Record<string, unknown>): Promise<void> {
  const bucket = await getGCSBucket();
  const blob = bucket.file(path);
  let existing = '';
  try {
    const [exists] = await blob.exists();
    if (exists) {
      const [buf] = await blob.download();
      existing = buf.toString('utf-8');
    }
  } catch {
    // start fresh
  }
  const line = JSON.stringify(record);
  const content = existing ? existing.trimEnd() + '\n' + line + '\n' : line + '\n';
  await blob.save(content, { contentType: 'application/x-ndjson' });
}

export function readUserSettings(): Promise<GCSUserSettings | null> {
  return readJSON<GCSUserSettings>('user_settings.json');
}

export function writeUserSettings(settings: GCSUserSettings): Promise<void> {
  return writeJSON('user_settings.json', settings);
}

export function readTrainingPlan(): Promise<GCSTrainingPlan | null> {
  return readJSON<GCSTrainingPlan>('training_plan.json');
}

export function writeTrainingPlan(plan: GCSTrainingPlan): Promise<void> {
  return writeJSON('training_plan.json', plan);
}

export function appendRecommendLog(record: Record<string, unknown>): Promise<void> {
  return appendJSONL('recommend_log.jsonl', record);
}

export function appendUserResponse(record: Record<string, unknown>): Promise<void> {
  return appendJSONL('user_response.jsonl', record);
}

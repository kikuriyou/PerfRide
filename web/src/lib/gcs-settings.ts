import type {
  CoachDecisionRecord,
  GCSTrainingPlan,
  GCSUserSettings,
  NotificationLogRecord,
  TrainingSession,
  WeeklyPlanReviewStore,
} from '@/lib/gcs-schema';
import { resolvePhaseName } from '@/lib/gcs-schema';

export type {
  ApprovedWeekPayload,
  CoachDecisionRecord,
  CoachAutonomy,
  DayName,
  GCSTrainingPlan,
  GCSUserSettings,
  NotificationLogRecord,
  PhaseName,
  ProposedSession,
  ReviewStatus,
  SessionStatus,
  TrainingSession,
  WeekStatus,
  WeeklyPlanReviewPayload,
  WeeklyPlanReviewStore,
  WeeklyReviewMetadata,
  WeeklySchedule,
  WeeklyScheduleDay,
} from '@/lib/gcs-schema';
export { resolvePhaseName } from '@/lib/gcs-schema';

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

async function readJSONL<T>(path: string): Promise<T[]> {
  try {
    const bucket = await getGCSBucket();
    const blob = bucket.file(path);
    const [exists] = await blob.exists();
    if (!exists) return [];
    const [buf] = await blob.download();
    return buf
      .toString('utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
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

export async function readTrainingPlan(): Promise<GCSTrainingPlan | null> {
  const raw = await readJSON<GCSTrainingPlan>('training_plan.json');
  if (!raw) return null;
  const weeklyPlan = Object.fromEntries(
    Object.entries(raw.weekly_plan).map(([k, v]) => [
      k,
      {
        ...v,
        phase: resolvePhaseName(v.phase),
        sessions: ensureSessionIds(v.sessions, v.week_start),
      },
    ]),
  );
  return {
    ...raw,
    phases: raw.phases.map((p) => ({ ...p, name: resolvePhaseName(p.name) })),
    weekly_plan: weeklyPlan,
  };
}

export function writeTrainingPlan(plan: GCSTrainingPlan): Promise<void> {
  return writeJSON('training_plan.json', plan);
}

export async function readWeeklyPlanReview(): Promise<WeeklyPlanReviewStore> {
  const store = await readJSON<WeeklyPlanReviewStore>('weekly_plan_review.json');
  if (!store) return { reviews: {}, updated_at: new Date().toISOString() };
  return {
    ...store,
    reviews: Object.fromEntries(
      Object.entries(store.reviews).map(([k, v]) => [
        k,
        { ...v, draft: { ...v.draft, phase: resolvePhaseName(v.draft.phase) } },
      ]),
    ),
  };
}

export function writeWeeklyPlanReview(store: WeeklyPlanReviewStore): Promise<void> {
  return writeJSON('weekly_plan_review.json', store);
}

export function appendRecommendLog(record: Record<string, unknown>): Promise<void> {
  return appendJSONL('recommend_log.jsonl', record);
}

export function appendUserResponse(record: Record<string, unknown>): Promise<void> {
  return appendJSONL('user_response.jsonl', record);
}

export function readCoachDecision(): Promise<CoachDecisionRecord | null> {
  return readJSON<CoachDecisionRecord>('coach_decision.json');
}

export function writeCoachDecision(record: CoachDecisionRecord): Promise<void> {
  return writeJSON('coach_decision.json', record);
}

export function appendNotificationLog(record: NotificationLogRecord): Promise<void> {
  return appendJSONL('notification_log.jsonl', record as unknown as Record<string, unknown>);
}

export async function readNotificationLog(limit = 20): Promise<NotificationLogRecord[]> {
  const records = await readJSONL<NotificationLogRecord>('notification_log.jsonl');
  return records.slice(-limit).reverse();
}

function ensureSessionIds(sessions: TrainingSession[], weekStart: string): TrainingSession[] {
  return sessions.map((session, index) => {
    if (session.session_id) return session;
    const origin = session.origin ?? 'baseline';
    const sessionId =
      origin === 'baseline'
        ? `baseline:${weekStart}:${session.date}`
        : `appended:${weekStart}:${session.date}:legacy-${index}`;
    return { ...session, session_id: sessionId };
  });
}

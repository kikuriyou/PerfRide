import type {
  AgentOperationLogRecord,
  ApprovedWeekPayload,
  CoachDecisionRecord,
  GCSTrainingPlan,
  GCSUserSettings,
  NotificationLogRecord,
  TrainingSession,
  WeeklyPlanReviewStore,
} from '@/lib/gcs-schema';
import { resolvePhaseName } from '@/lib/gcs-schema';

export type GCSUserId = string | number;

export type {
  AgentOperationLogRecord,
  AgentOperationLogStatus,
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
  UserLocale,
  WeekStatus,
  WeeklyPlanReviewPayload,
  WeeklyPlanReviewStore,
  WeeklyReviewMetadata,
  WeeklySchedule,
  WeeklyScheduleDay,
} from '@/lib/gcs-schema';
export { resolvePhaseName } from '@/lib/gcs-schema';

interface ReadUserSettingsOptions {
  fallbackLegacy?: boolean;
}

async function getGCSBucket() {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  return storage.bucket(process.env.GCS_BUCKET!);
}

export function normalizeGcsUserId(userId: GCSUserId): string {
  const normalized = String(userId).trim();
  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new Error('Invalid GCS user id');
  }
  return normalized;
}

export function userObjectPath(userId: GCSUserId, filename: string): string {
  return `users/${normalizeGcsUserId(userId)}/${filename.replace(/^\/+/, '')}`;
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

export function readGCSJSON<T>(path: string): Promise<T | null> {
  return readJSON<T>(path);
}

export function writeGCSJSON(path: string, data: unknown): Promise<void> {
  return writeJSON(path, data);
}

export async function deleteGCSObject(path: string): Promise<void> {
  const bucket = await getGCSBucket();
  const blob = bucket.file(path);
  await blob.delete({ ignoreNotFound: true });
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

function objectPath(userId: GCSUserId | undefined, filename: string): string {
  return userId === undefined ? filename : userObjectPath(userId, filename);
}

export async function readUserSettings(
  userId?: GCSUserId,
  options: ReadUserSettingsOptions = {},
): Promise<GCSUserSettings | null> {
  if (userId === undefined) {
    return readJSON<GCSUserSettings>('user_settings.json');
  }
  const settings = await readJSON<GCSUserSettings>(userObjectPath(userId, 'settings.json'));
  if (settings || !options.fallbackLegacy) return settings;
  const legacy = await readJSON<GCSUserSettings>('user_settings.json');
  return legacy?.strava_owner_id === Number(userId) ? legacy : null;
}

export function writeUserSettings(settings: GCSUserSettings, userId?: GCSUserId): Promise<void> {
  const filename = userId === undefined ? 'user_settings.json' : 'settings.json';
  return writeJSON(objectPath(userId, filename), settings);
}

type RawTrainingPlan = Partial<Omit<GCSTrainingPlan, 'phases' | 'weekly_plan'>> &
  Record<string, unknown> & {
    phases?: unknown;
    weekly_plan?: unknown;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSessions(value: unknown): TrainingSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter(
      (session) => typeof session.date === 'string' && typeof session.type === 'string',
    ) as unknown as TrainingSession[];
}

function normalizeWeeklyPlan(value: unknown): GCSTrainingPlan['weekly_plan'] {
  const entries: ReadonlyArray<readonly [string, unknown]> = Array.isArray(value)
    ? value.map((entry, index) => {
        const weekNumber =
          isRecord(entry) && typeof entry.week_number === 'number' ? entry.week_number : index + 1;
        return [`week_${weekNumber}`, entry] as const;
      })
    : isRecord(value)
      ? Object.entries(value)
      : [];

  return Object.fromEntries(
    entries
      .filter((entry): entry is readonly [string, Record<string, unknown>] => isRecord(entry[1]))
      .map(([k, v]) => {
        const phase = typeof v.phase === 'string' ? v.phase : 'maintenance';
        const weekStart = typeof v.week_start === 'string' ? v.week_start : k;
        const sessions = normalizeSessions(v.sessions);
        return [
          k,
          {
            ...v,
            phase: resolvePhaseName(phase),
            sessions: ensureSessionIds(sessions, weekStart),
          } as ApprovedWeekPayload,
        ];
      }),
  );
}

export function normalizeTrainingPlan(raw: RawTrainingPlan): GCSTrainingPlan {
  const phases = Array.isArray(raw.phases)
    ? raw.phases.filter(isRecord).map(
        (phase) =>
          ({
            ...phase,
            name: resolvePhaseName(typeof phase.name === 'string' ? phase.name : 'custom'),
          }) as GCSTrainingPlan['phases'][number],
      )
    : [];

  return {
    ...raw,
    phases,
    weekly_plan: normalizeWeeklyPlan(raw.weekly_plan),
  } as GCSTrainingPlan;
}

export async function readTrainingPlan(userId?: GCSUserId): Promise<GCSTrainingPlan | null> {
  const raw = await readJSON<RawTrainingPlan>(objectPath(userId, 'training_plan.json'));
  if (!raw) return null;
  return normalizeTrainingPlan(raw);
}

export function writeTrainingPlan(plan: GCSTrainingPlan, userId?: GCSUserId): Promise<void> {
  return writeJSON(objectPath(userId, 'training_plan.json'), plan);
}

export async function readWeeklyPlanReview(userId?: GCSUserId): Promise<WeeklyPlanReviewStore> {
  const store = await readJSON<WeeklyPlanReviewStore>(
    objectPath(userId, 'weekly_plan_review.json'),
  );
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

export function writeWeeklyPlanReview(
  store: WeeklyPlanReviewStore,
  userId?: GCSUserId,
): Promise<void> {
  return writeJSON(objectPath(userId, 'weekly_plan_review.json'), store);
}

export function appendRecommendLog(
  record: Record<string, unknown>,
  userId?: GCSUserId,
): Promise<void> {
  return appendJSONL(objectPath(userId, 'recommend_log.jsonl'), record);
}

export function appendUserResponse(
  record: Record<string, unknown>,
  userId?: GCSUserId,
): Promise<void> {
  return appendJSONL(objectPath(userId, 'user_response.jsonl'), record);
}

export function readCoachDecision(userId?: GCSUserId): Promise<CoachDecisionRecord | null> {
  return readJSON<CoachDecisionRecord>(objectPath(userId, 'coach_decision.json'));
}

export function writeCoachDecision(record: CoachDecisionRecord, userId?: GCSUserId): Promise<void> {
  return writeJSON(objectPath(userId, 'coach_decision.json'), record);
}

export function appendNotificationLog(
  record: NotificationLogRecord,
  userId?: GCSUserId,
): Promise<void> {
  return appendJSONL(
    objectPath(userId, 'notification_log.jsonl'),
    record as unknown as Record<string, unknown>,
  );
}

export async function readNotificationLog(
  limit = 20,
  userId?: GCSUserId,
): Promise<NotificationLogRecord[]> {
  const records = await readJSONL<NotificationLogRecord>(
    objectPath(userId, 'notification_log.jsonl'),
  );
  return records.slice(-limit).reverse();
}

export function appendAgentOperationLog(
  record: AgentOperationLogRecord,
  userId?: GCSUserId,
): Promise<void> {
  return appendJSONL(
    objectPath(userId, 'agent_operation_log.jsonl'),
    record as unknown as Record<string, unknown>,
  );
}

export async function readAgentOperationLog(
  limit = 50,
  userId?: GCSUserId,
): Promise<AgentOperationLogRecord[]> {
  const records = await readJSONL<AgentOperationLogRecord>(
    objectPath(userId, 'agent_operation_log.jsonl'),
  );
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

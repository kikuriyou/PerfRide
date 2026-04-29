export type CoachStatusKind =
  | 'webhook_recommendation'
  | 'weekly_plan_created'
  | 'weekly_plan_updated'
  | 'state_change';

export interface CoachStatusBannerItem {
  id: string;
  kind: CoachStatusKind;
  priority: number;
  message: string;
  actionLabel?: string;
  href?: string;
}

export interface CoachStatusWebhookSource {
  activity_id?: number | null;
  trace_id?: string | null;
  created_at?: string | null;
}

export interface CoachStatusWeekSource {
  week_start: string;
  plan_revision: number;
}

export interface CoachStatusCandidateInput {
  webhookDecision?: CoachStatusWebhookSource | null;
  currentWeek?: CoachStatusWeekSource | null;
  otherItems?: CoachStatusBannerItem[];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const COACH_STATUS_DISMISS_KEY = 'perfride_coach_status_dismissed';

export function buildCoachStatusCandidates(
  input: CoachStatusCandidateInput,
): CoachStatusBannerItem[] {
  const items: CoachStatusBannerItem[] = [];
  const webhook = input.webhookDecision;
  if (webhook) {
    const suffix = webhook.activity_id ?? webhook.trace_id ?? webhook.created_at ?? 'latest';
    items.push({
      id: `webhook:${suffix}`,
      kind: 'webhook_recommendation',
      priority: 0,
      message: '最新ライドから、おすすめを更新しました。',
      actionLabel: '見る',
      href: '/dashboard',
    });
  }

  const week = input.currentWeek;
  if (week) {
    const created = week.plan_revision <= 1;
    items.push({
      id: `weekly:${week.week_start}:${week.plan_revision}`,
      kind: created ? 'weekly_plan_created' : 'weekly_plan_updated',
      priority: 1,
      message: created ? '今週のプランを作成しました。' : '今週のプランを更新しました。',
      actionLabel: '見る',
      href: '/weekly-plan',
    });
  }

  for (const item of input.otherItems ?? []) {
    items.push({ ...item, priority: item.priority ?? 2 });
  }

  return items.sort((a, b) => a.priority - b.priority);
}

export function readDismissedCoachStatusIds(storage: StorageLike): Set<string> {
  try {
    const raw = storage.getItem(COACH_STATUS_DISMISS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

export function writeDismissedCoachStatusIds(storage: StorageLike, ids: Set<string>): void {
  try {
    storage.setItem(COACH_STATUS_DISMISS_KEY, JSON.stringify([...ids]));
  } catch {
    // fail open
  }
}

export function dismissCoachStatusItem(storage: StorageLike, itemId: string): Set<string> {
  const dismissed = readDismissedCoachStatusIds(storage);
  dismissed.add(itemId);
  writeDismissedCoachStatusIds(storage, dismissed);
  return dismissed;
}

export function selectCoachStatusItem(
  items: CoachStatusBannerItem[],
  dismissedIds: Set<string>,
): CoachStatusBannerItem | null {
  return (
    [...items].sort((a, b) => a.priority - b.priority).find((item) => !dismissedIds.has(item.id)) ??
    null
  );
}

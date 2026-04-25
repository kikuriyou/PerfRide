export interface MinimalWeeklyPlanData {
  coach_autonomy: string;
  current_week: { sessions: { type: string; status: string }[] } | null;
  pending_review: unknown | null;
}

export function shouldRenderWeeklyPlanCard(data: MinimalWeeklyPlanData | null): boolean {
  if (!data) return false;
  if (data.coach_autonomy !== 'coach') return false;
  return Boolean(data.current_week) || Boolean(data.pending_review);
}

export function plannedSessionCount(
  currentWeek: { sessions: { type: string; status: string }[] } | null,
): number {
  if (!currentWeek) return 0;
  return currentWeek.sessions.filter(
    (session) => session.type !== 'rest' && session.status !== 'skipped',
  ).length;
}

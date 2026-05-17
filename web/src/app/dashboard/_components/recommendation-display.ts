import type { ProposedSession, TrainingSession } from '@/lib/gcs-schema';
import {
  formatSessionBrief,
  formatSessionWithTss,
  formatShortDate,
} from '@/lib/training-session-display';

export function displaySourceLabel(source: string | null | undefined): string | null {
  if (source === 'webhook') return 'After latest ride';
  if (source === 'generated') return "Today's status";
  if (source === 'weekly_plan') return null;
  return source ? 'Recommendation' : null;
}

export function buildReplacePreview(
  target: TrainingSession | null | undefined,
  proposed: ProposedSession | null | undefined,
): string | null {
  if (!target || !proposed?.session_date || proposed.is_rest) return null;
  return `Change ${formatShortDate(proposed.session_date)} from ${formatSessionBrief(
    target,
  )} to ${formatSessionBrief({
    type: proposed.session_type,
    duration_minutes: proposed.duration_minutes,
  })}`;
}

export function hasVisibleReplaceChange(
  target: TrainingSession | null | undefined,
  proposed: ProposedSession | null | undefined,
): boolean {
  if (!target || !proposed || proposed.is_rest) return true;
  const proposedStatus = proposed.registered ? 'registered' : 'planned';
  return (
    target.type !== proposed.session_type ||
    (target.duration_minutes ?? 0) !== (proposed.duration_minutes ?? 0) ||
    (target.target_tss ?? target.planned_tss ?? 0) !== (proposed.target_tss ?? 0) ||
    target.status !== proposedStatus ||
    (proposed.workout_id !== undefined && target.workout_id !== proposed.workout_id)
  );
}

export function buildWebhookDiffLine(
  target: TrainingSession | null | undefined,
  proposed: ProposedSession | null | undefined,
): string | null {
  if (!proposed) return null;
  if (proposed.is_rest) {
    return target
      ? `Recovery first: skip ${formatSessionBrief(target)}`
      : 'Recovery first: prioritize rest today';
  }
  if (!target) return 'Recommendation based on your latest ride';

  const before = formatSessionBrief(target);
  const after = formatSessionBrief({
    type: proposed.is_rest ? 'rest' : proposed.session_type,
    duration_minutes: proposed.duration_minutes,
  });
  if (before === after) return `Keep as planned: ${after}`;
  return `Adjust lighter: ${before} -> ${after}`;
}

export function buildKeepWeeklyPlanMessage(): string {
  return 'Marked as no change. Weekly Plan was not updated, and this recommendation is handled.';
}

export function buildReplaceSuccessMessage(
  proposed: ProposedSession,
  target?: TrainingSession | null,
): string {
  const after = formatSessionBrief({
    type: proposed.session_type,
    duration_minutes: proposed.duration_minutes,
  });
  if (target && !hasVisibleReplaceChange(target, proposed)) {
    return `${formatShortDate(
      proposed.session_date,
    )} is already ${after} in Weekly Plan. No change was needed, and this recommendation is handled.`;
  }

  const before = target ? ` from ${formatSessionBrief(target)}` : '';
  return `Updated ${formatShortDate(proposed.session_date)} in Weekly Plan${before} to ${after}.`;
}

export function buildReplaceConflictMessage(proposed: ProposedSession): string {
  return `${formatShortDate(proposed.session_date)} has changed. Reload and try again.`;
}

export function proposedSessionHeading(proposed: ProposedSession): string {
  if (proposed.is_rest) return 'Rest recommendation for today';
  return formatSessionWithTss({
    type: proposed.session_type,
    duration_minutes: proposed.duration_minutes,
    target_tss: proposed.target_tss,
  });
}

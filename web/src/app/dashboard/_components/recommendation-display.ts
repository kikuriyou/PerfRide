import type { ProposedSession, TrainingSession } from '@/lib/gcs-schema';
import {
  formatSessionBrief,
  formatSessionWithTss,
  formatShortDate,
} from '@/lib/training-session-display';

export function displaySourceLabel(source: string | null | undefined, label?: string): string {
  if (source === 'webhook') return 'アクティビティ後の提案';
  if (source === 'weekly_plan') return '今週のプラン';
  if (source === 'generated') return '今の状態から作成';
  return label ?? '提案';
}

export function buildReplacePreview(
  target: TrainingSession | null | undefined,
  proposed: ProposedSession | null | undefined,
): string | null {
  if (!target || !proposed?.session_date || proposed.is_rest) return null;
  return `${formatShortDate(proposed.session_date)} の予定を ${formatSessionBrief(
    target,
  )} から ${formatSessionBrief({
    type: proposed.session_type,
    duration_minutes: proposed.duration_minutes,
  })} に変更します`;
}

export function buildReplaceSuccessMessage(proposed: ProposedSession): string {
  return `${formatShortDate(proposed.session_date)} の予定を ${formatSessionBrief({
    type: proposed.session_type,
    duration_minutes: proposed.duration_minutes,
  })} に変更しました。`;
}

export function buildReplaceConflictMessage(proposed: ProposedSession): string {
  return `${formatShortDate(
    proposed.session_date,
  )} のプランが更新されています。再読み込みしてからもう一度選んでください。`;
}

export function proposedSessionHeading(proposed: ProposedSession): string {
  if (proposed.is_rest) return '今日は休養提案です';
  return formatSessionWithTss({
    type: proposed.session_type,
    duration_minutes: proposed.duration_minutes,
    target_tss: proposed.target_tss,
  });
}

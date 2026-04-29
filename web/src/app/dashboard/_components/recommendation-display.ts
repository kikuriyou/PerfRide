import type { ProposedSession, TrainingSession } from '@/lib/gcs-schema';
import {
  formatSessionBrief,
  formatSessionWithTss,
  formatShortDate,
} from '@/lib/training-session-display';

export function displaySourceLabel(source: string | null | undefined): string | null {
  if (source === 'webhook') return '最新ライドから';
  if (source === 'generated') return '今日の状態から';
  if (source === 'weekly_plan') return null;
  return source ? '提案' : null;
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

export function buildWebhookDiffLine(
  target: TrainingSession | null | undefined,
  proposed: ProposedSession | null | undefined,
): string | null {
  if (!proposed) return null;
  if (proposed.is_rest) {
    return target
      ? `回復優先: ${formatSessionBrief(target)} は見送り`
      : '回復優先: 今日は休養を優先しましょう';
  }
  if (!target) return '最新ライドを踏まえた提案です';

  const before = formatSessionBrief(target);
  const after = formatSessionBrief({
    type: proposed.is_rest ? 'rest' : proposed.session_type,
    duration_minutes: proposed.duration_minutes,
  });
  if (before === after) return `予定どおりでOK: ${after}`;
  return `軽めに調整: ${before} → ${after}`;
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

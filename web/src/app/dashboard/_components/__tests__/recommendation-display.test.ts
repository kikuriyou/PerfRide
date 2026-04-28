import { describe, expect, it } from 'vitest';
import {
  buildReplaceConflictMessage,
  buildReplacePreview,
  buildReplaceSuccessMessage,
  displaySourceLabel,
  proposedSessionHeading,
} from '../recommendation-display';

describe('recommendation display helpers', () => {
  it('builds a concrete replace preview', () => {
    expect(
      buildReplacePreview(
        { date: '2026-04-28', type: 'recovery', duration_minutes: 45, status: 'planned' },
        { session_date: '2026-04-28', session_type: 'sweetspot', duration_minutes: 50 },
      ),
    ).toBe('4/28 の予定を Recovery 45min から Sweetspot 50min に変更します');
  });

  it('builds date-specific success and conflict messages', () => {
    const proposed = {
      session_date: '2026-04-28',
      session_type: 'sweetspot',
      duration_minutes: 50,
    };
    expect(buildReplaceSuccessMessage(proposed)).toBe(
      '4/28 の予定を Sweetspot 50min に変更しました。',
    );
    expect(buildReplaceConflictMessage(proposed)).toBe(
      '4/28 のプランが更新されています。再読み込みしてからもう一度選んでください。',
    );
  });

  it('uses rest and missing-duration labels safely', () => {
    expect(proposedSessionHeading({ is_rest: true })).toBe('今日は休養提案です');
    expect(proposedSessionHeading({ session_type: 'sweetspot', target_tss: 55 })).toBe(
      'Sweetspot 時間未定 · TSS 55',
    );
  });

  it('maps source labels to user-facing Japanese labels', () => {
    expect(displaySourceLabel('webhook', 'Webhook decision')).toBe('アクティビティ後の提案');
    expect(displaySourceLabel('weekly_plan', 'Weekly Plan')).toBe('今週のプラン');
    expect(displaySourceLabel('generated', 'Generated now')).toBe('今の状態から作成');
  });
});

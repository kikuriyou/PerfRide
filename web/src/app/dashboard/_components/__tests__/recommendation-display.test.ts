import { describe, expect, it } from 'vitest';
import {
  buildKeepWeeklyPlanMessage,
  buildReplaceConflictMessage,
  buildReplacePreview,
  buildReplaceSuccessMessage,
  buildWebhookDiffLine,
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
    ).toBe('Change 4/28 from Recovery 45min to Sweetspot 50min');
  });

  it('builds date-specific success and conflict messages', () => {
    const proposed = {
      session_date: '2026-04-28',
      session_type: 'sweetspot',
      duration_minutes: 50,
    };
    expect(buildReplaceSuccessMessage(proposed)).toBe(
      'Updated 4/28 in Weekly Plan to Sweetspot 50min.',
    );
    expect(buildReplaceConflictMessage(proposed)).toBe('4/28 has changed. Reload and try again.');
  });

  it('makes no-op replace results explicit', () => {
    expect(
      buildReplaceSuccessMessage(
        {
          session_date: '2026-04-28',
          session_type: 'endurance',
          duration_minutes: 60,
          target_tss: 40,
        },
        {
          date: '2026-04-28',
          type: 'endurance',
          duration_minutes: 60,
          target_tss: 40,
          status: 'planned',
        },
      ),
    ).toBe(
      '4/28 is already Endurance 60min in Weekly Plan. No change was needed, and this recommendation is handled.',
    );
  });

  it('explains unchanged decisions as handled', () => {
    expect(buildKeepWeeklyPlanMessage()).toBe(
      'Marked as no change. Weekly Plan was not updated, and this recommendation is handled.',
    );
  });

  it('uses rest and missing-duration labels safely', () => {
    expect(proposedSessionHeading({ is_rest: true })).toBe('Rest recommendation for today');
    expect(proposedSessionHeading({ session_type: 'sweetspot', target_tss: 55 })).toBe(
      'Sweetspot Duration TBD · TSS 55',
    );
  });

  it('maps source labels to user-facing labels', () => {
    expect(displaySourceLabel('webhook')).toBe('After latest ride');
    expect(displaySourceLabel('generated')).toBe("Today's status");
    expect(displaySourceLabel('weekly_plan')).toBeNull();
  });

  it('builds webhook diff lines against the weekly target', () => {
    expect(
      buildWebhookDiffLine(
        { date: '2026-04-28', type: 'threshold', duration_minutes: 60, status: 'planned' },
        { session_date: '2026-04-28', session_type: 'recovery', duration_minutes: 45 },
      ),
    ).toBe('Adjust lighter: Threshold 60min -> Recovery 45min');

    expect(
      buildWebhookDiffLine(
        { date: '2026-04-28', type: 'endurance', duration_minutes: 60, status: 'planned' },
        { session_date: '2026-04-28', session_type: 'endurance', duration_minutes: 60 },
      ),
    ).toBe('Keep as planned: Endurance 60min');

    expect(
      buildWebhookDiffLine(
        { date: '2026-04-28', type: 'threshold', duration_minutes: 60, status: 'planned' },
        { session_date: '2026-04-28', is_rest: true },
      ),
    ).toBe('Recovery first: skip Threshold 60min');

    expect(
      buildWebhookDiffLine(null, {
        session_date: '2026-04-28',
        session_type: 'recovery',
        duration_minutes: 45,
      }),
    ).toBe('Recommendation based on your latest ride');
  });
});

import { describe, expect, it } from 'vitest';

import {
  agentOperationLabel,
  agentOperationStatusLabel,
  formatAgentLogTime,
} from '../AgentOperationLogPanel';

describe('AgentOperationLogPanel helpers', () => {
  it('labels known operation statuses', () => {
    expect(agentOperationStatusLabel('triggered')).toBe('トリガーON');
    expect(agentOperationStatusLabel('completed')).toBe('完了');
  });

  it('labels known operation names', () => {
    expect(agentOperationLabel('webhook_recommend')).toBe('Webhook 推薦');
    expect(agentOperationLabel('mywhoosh_settings')).toBe('MyWhoosh 設定');
    expect(agentOperationLabel('custom_process')).toBe('custom_process');
  });

  it('formats timestamps in JST', () => {
    expect(formatAgentLogTime('2026-05-01T15:00:00.000Z')).toContain('05/02');
  });
});

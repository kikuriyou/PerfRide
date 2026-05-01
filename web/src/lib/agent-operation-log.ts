import type {
  AgentOperationLogRecord,
  AgentOperationLogStatus,
  GCSUserId,
} from '@/lib/gcs-settings';
import { appendAgentOperationLog } from '@/lib/gcs-settings';

interface RecordAgentOperationLogInput {
  status: AgentOperationLogStatus;
  operation: string;
  trigger: string;
  message: string;
  runId?: string | null;
  traceId?: string | null;
  sessionId?: string | null;
  activityId?: number | null;
  metadata?: Record<string, unknown>;
}

export async function recordAgentOperationLog(
  userId: GCSUserId,
  input: RecordAgentOperationLogInput,
): Promise<void> {
  const record: AgentOperationLogRecord = {
    created_at: new Date().toISOString(),
    status: input.status,
    operation: input.operation,
    trigger: input.trigger,
    message: input.message,
    run_id: input.runId ?? null,
    trace_id: input.traceId ?? null,
    session_id: input.sessionId ?? null,
    activity_id: input.activityId ?? null,
    metadata: input.metadata,
  };

  try {
    await appendAgentOperationLog(record, userId);
  } catch (error) {
    console.error('[agent-operation-log] append failed:', error);
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { readUserSettings } from '@/lib/gcs-settings';

export interface ReplaceRequestBody {
  target_session_id: string;
  session_date: string;
  session_type: string;
  duration_minutes: number;
  target_tss: number;
  notes?: string;
  workout_id?: string;
  status?: string;
  expected_plan_revision: number;
}

export function isReplaceRequestBody(value: unknown): value is ReplaceRequestBody {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.target_session_id === 'string' &&
    typeof v.session_date === 'string' &&
    typeof v.session_type === 'string' &&
    typeof v.duration_minutes === 'number' &&
    typeof v.target_tss === 'number' &&
    typeof v.expected_plan_revision === 'number' &&
    (v.notes === undefined || typeof v.notes === 'string') &&
    (v.workout_id === undefined || typeof v.workout_id === 'string') &&
    (v.status === undefined || typeof v.status === 'string')
  );
}

function normalizeAgentPayload(status: number, payload: unknown): { status: number; payload: unknown } {
  if (status === 409) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? (payload as { detail: unknown }).detail
        : payload;
    return {
      status,
      payload:
        detail && typeof detail === 'object'
          ? detail
          : { status: 'conflict', message: 'Plan was updated elsewhere.' },
    };
  }
  if (status >= 200 && status < 300) return { status: 200, payload: payload ?? {} };
  const errorMessage =
    payload && typeof payload === 'object' && 'detail' in payload
      ? String((payload as { detail: unknown }).detail)
      : `Agent returned ${status}`;
  return { status, payload: { error: errorMessage } };
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const settings = await readUserSettings();
  if ((settings?.coach_autonomy ?? 'suggest') !== 'coach') {
    return NextResponse.json(
      { error: 'Coach autonomy must be enabled to replace sessions.' },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as unknown;
  if (!isReplaceRequestBody(body)) {
    return NextResponse.json({ error: 'Invalid replace payload' }, { status: 400 });
  }

  const agentUrl = process.env.AGENT_API_URL || 'http://localhost:8000';
  const resp = await fetch(`${agentUrl}/api/agent/weekly-plan/replace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!resp) {
    return NextResponse.json({ error: 'Failed to reach agent service.' }, { status: 502 });
  }
  const payload = await resp.json().catch(() => null);
  const outcome = normalizeAgentPayload(resp.status, payload);
  return NextResponse.json(outcome.payload, { status: outcome.status });
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { readUserSettings } from '@/lib/gcs-settings';

export interface AppendRequestBody {
  session_date: string;
  session_type: string;
  duration_minutes: number;
  target_tss: number;
  notes?: string;
  expected_plan_revision: number;
}

function normalizeAgentPayload(status: number, payload: unknown): AppendProxyOutcome {
  if (status !== 409) {
    if (status >= 200 && status < 300) return { status: 200, payload: payload ?? {} };
    const errorMessage =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : `Agent returned ${status}`;
    return { status, payload: { error: errorMessage } };
  }

  const detail =
    payload && typeof payload === 'object' && 'detail' in payload
      ? (payload as { detail: unknown }).detail
      : payload;
  return {
    status: 409,
    payload:
      detail && typeof detail === 'object'
        ? detail
        : { status: 'conflict', message: 'Plan was updated elsewhere.' },
  };
}

export function isAppendRequestBody(value: unknown): value is AppendRequestBody {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.session_date === 'string' &&
    typeof v.session_type === 'string' &&
    typeof v.duration_minutes === 'number' &&
    typeof v.target_tss === 'number' &&
    typeof v.expected_plan_revision === 'number' &&
    (v.notes === undefined || typeof v.notes === 'string')
  );
}

export interface AppendProxyOutcome {
  status: number;
  payload: unknown;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function forwardAppendToAgent(
  body: AppendRequestBody,
  agentUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<AppendProxyOutcome> {
  let agentResponse: Response;
  try {
    agentResponse = await fetchImpl(`${agentUrl}/api/agent/weekly-plan/append`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[POST /api/weekly-plan/append] fetch failed:', err);
    return { status: 502, payload: { error: 'Failed to reach agent service.' } };
  }

  let payload: unknown = null;
  try {
    payload = await agentResponse.json();
  } catch {
    payload = null;
  }

  return normalizeAgentPayload(agentResponse.status, payload);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await readUserSettings();
  if ((settings?.coach_autonomy ?? 'suggest') !== 'coach') {
    return NextResponse.json(
      { error: 'Coach autonomy must be enabled to append sessions.' },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isAppendRequestBody(body)) {
    return NextResponse.json({ error: 'Invalid append payload' }, { status: 400 });
  }

  const agentUrl = process.env.AGENT_API_URL || 'http://localhost:8000';
  const outcome = await forwardAppendToAgent(body, agentUrl);
  return NextResponse.json(outcome.payload, { status: outcome.status });
}

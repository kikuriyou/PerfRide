import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { agentFetch } from '@/lib/agent';
import { authOptions } from '@/lib/auth';
import { readUserSettings, readWeeklyPlanReview } from '@/lib/gcs-settings';

interface WeeklyRespondBody {
  review_id: string;
  action: 'approve' | 'modify' | 'dismiss';
  user_message?: string;
  expected_plan_revision: number;
}

export function unwrapAgentPayload(
  status: number,
  payload: unknown,
): { status: number; payload: unknown } {
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

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const reviewId = request.nextUrl.searchParams.get('review_id');
  if (!reviewId) {
    return NextResponse.json({ error: 'review_id is required' }, { status: 400 });
  }

  const store = await readWeeklyPlanReview(session.user.id);
  const review = store.reviews[reviewId];
  if (!review) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }

  return NextResponse.json({ review });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const settings = await readUserSettings(session.user.id, { fallbackLegacy: true });
  if ((settings?.coach_autonomy ?? 'suggest') !== 'coach') {
    return NextResponse.json(
      { error: 'Coach autonomy must be enabled to respond to weekly reviews.' },
      { status: 403 },
    );
  }
  try {
    const body: WeeklyRespondBody = await request.json();
    const resp = await agentFetch('/api/agent/weekly-plan/respond', {
      method: 'POST',
      body: JSON.stringify({ ...body, user_id: session.user.id }),
    });

    const payload = await resp.json().catch(() => null);
    const outcome = unwrapAgentPayload(resp.status, payload);
    return NextResponse.json(outcome.payload, { status: outcome.status });
  } catch (error) {
    console.error('Weekly respond API error:', error);
    return NextResponse.json(
      { error: 'Failed to send weekly response. Make sure the agent service is running.' },
      { status: 500 },
    );
  }
}

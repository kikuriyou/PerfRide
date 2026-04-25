import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { readWeeklyPlanReview } from '@/lib/gcs-settings';

interface WeeklyRespondBody {
  review_id: string;
  action: 'approve' | 'modify' | 'dismiss';
  user_message?: string;
  expected_plan_revision: number;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const reviewId = request.nextUrl.searchParams.get('review_id');
  if (!reviewId) {
    return NextResponse.json({ error: 'review_id is required' }, { status: 400 });
  }

  const store = await readWeeklyPlanReview();
  const review = store.reviews[reviewId];
  if (!review) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }

  return NextResponse.json({ review });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body: WeeklyRespondBody = await request.json();
    const agentUrl = process.env.AGENT_API_URL || 'http://localhost:8000';
    const resp = await fetch(`${agentUrl}/api/agent/weekly-plan/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      return NextResponse.json({ error: `Agent API error: ${error}` }, { status: resp.status });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Weekly respond API error:', error);
    return NextResponse.json(
      { error: 'Failed to send weekly response. Make sure the agent service is running.' },
      { status: 500 },
    );
  }
}

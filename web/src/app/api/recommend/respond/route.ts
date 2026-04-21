import { NextResponse } from 'next/server';

interface RespondBody {
  session_id: string;
  action: 'approve' | 'modify' | 'rest';
  user_message?: string;
  modification_count?: number;
}

export async function POST(request: Request) {
  try {
    const body: RespondBody = await request.json();
    const agentUrl = process.env.AGENT_API_URL || 'http://localhost:8000';
    const resp = await fetch(`${agentUrl}/recommend/respond`, {
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
    console.error('Respond API error:', error);
    return NextResponse.json(
      { error: 'Failed to send response. Make sure the agent service is running.' },
      { status: 500 },
    );
  }
}

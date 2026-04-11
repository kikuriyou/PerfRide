import { NextResponse } from 'next/server';

/**
 * API Route: POST /api/recommend
 * Proxies training recommendation requests to the Python agent service.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const agentUrl = process.env.AGENT_API_URL || 'http://localhost:8000';

    const response = await fetch(`${agentUrl}/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goal: body.goal || 'fitness_maintenance',
        ftp: body.ftp || 200,
        goal_custom: body.goalCustom || null,
        recommend_mode: body.recommendMode || null,
        use_personal_data: body.usePersonalData ?? null,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Agent API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Recommend API error:', error);
    return NextResponse.json(
      { error: 'Failed to get recommendation. Make sure the agent service is running.' },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

interface LineEvent {
  type: string;
  replyToken: string;
  source: { userId: string };
  postback?: { data: string };
  message?: { type: string; text: string };
}

interface LineWebhookBody {
  events: LineEvent[];
}

function parsePostbackData(data: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of data.split('&')) {
    const [key, value] = pair.split('=');
    if (key && value !== undefined) {
      params[key] = decodeURIComponent(value);
    }
  }
  return params;
}

export async function POST(request: NextRequest) {
  const agentUrl = process.env.AGENT_API_URL || 'http://localhost:8000';

  try {
    const body: LineWebhookBody = await request.json();

    const postbackEvents = body.events.filter(
      (e) => e.type === 'postback' && e.postback?.data,
    );

    for (const event of postbackEvents) {
      const params = parsePostbackData(event.postback!.data);
      fetch(`${agentUrl}/recommend/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_user_id: event.source.userId,
          action: params.action,
          reply_token: event.replyToken,
          raw_data: params,
        }),
      }).catch((e) => console.error('Agent forward failed:', e));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('LINE webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}

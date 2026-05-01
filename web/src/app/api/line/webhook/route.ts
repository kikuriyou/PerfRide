import { NextRequest, NextResponse } from 'next/server';

import { parsePostbackData } from '@/lib/notify';

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

export function resolveLineForwardUrl(
  request: NextRequest,
  kind: string | undefined,
  agentUrl: string,
): string {
  if (kind === 'weekly_review') {
    return new URL('/api/weekly-plan/respond', request.url).toString();
  }
  return `${agentUrl}/recommend/respond`;
}

export async function POST(request: NextRequest) {
  const agentUrl = process.env.AGENT_API_URL || 'http://localhost:8000';

  try {
    const body: LineWebhookBody = await request.json();

    const postbackEvents = body.events.filter((e) => e.type === 'postback' && e.postback?.data);

    await Promise.all(
      postbackEvents.map(async (event) => {
        const params = parsePostbackData(event.postback!.data);
        const forwardUrl = resolveLineForwardUrl(request, params.kind, agentUrl);
        if (params.kind === 'weekly_review') {
          await fetch(forwardUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              review_id: params.review_id,
              action: params.action,
              expected_plan_revision: Number(params.plan_revision || '0'),
            }),
          });
          return;
        }
        await fetch(forwardUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            line_user_id: event.source.userId,
            action: params.action,
            reply_token: event.replyToken,
            raw_data: params,
          }),
        });
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('LINE webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { agentFetch, getAgentApiUrl } from '@/lib/agent';
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
    return `${agentUrl}/api/agent/weekly-plan/respond`;
  }
  return `${agentUrl}/recommend/respond`;
}

export async function POST(request: NextRequest) {
  try {
    const body: LineWebhookBody = await request.json();
    const agentUrl = getAgentApiUrl();

    const postbackEvents = body.events.filter((e) => e.type === 'postback' && e.postback?.data);

    await Promise.all(
      postbackEvents.map(async (event) => {
        const params = parsePostbackData(event.postback!.data);
        const forwardUrl = resolveLineForwardUrl(request, params.kind, agentUrl);
        if (params.kind === 'weekly_review') {
          await agentFetch(new URL(forwardUrl).pathname, {
            method: 'POST',
            body: JSON.stringify({
              user_id: params.user_id,
              review_id: params.review_id,
              action: params.action,
              expected_plan_revision: Number(params.plan_revision || '0'),
            }),
          });
          return;
        }
        await agentFetch(new URL(forwardUrl).pathname, {
          method: 'POST',
          body: JSON.stringify({
            user_id: params.user_id,
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

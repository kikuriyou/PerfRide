import { NextRequest, NextResponse } from 'next/server';
import { appendNotificationLog, readUserSettings, GCSUserSettings } from '@/lib/gcs-settings';
import type { NotificationLogRecord } from '@/lib/gcs-schema';
import {
  buildLinePostbackData,
  buildPushPayloadData,
  type NotificationAction,
  type NotificationMetadata,
} from '@/lib/notify';

interface NotifyRequest {
  user_id: string;
  title: string;
  body: string;
  actions?: NotificationAction[];
  metadata?: NotificationMetadata;
}

interface NotifyResult {
  channels_sent: string[];
  status: 'sent' | 'partial' | 'failed';
}

export function buildNotificationLogRecord(
  body: Pick<NotifyRequest, 'title' | 'body' | 'actions' | 'metadata'>,
  result: NotifyResult,
  createdAt = new Date().toISOString(),
): NotificationLogRecord {
  return {
    title: body.title,
    body: body.body,
    actions: body.actions ?? [],
    metadata: body.metadata,
    created_at: createdAt,
    channels_sent: result.channels_sent,
    status: result.status,
  };
}

export function buildFlexMessage(
  title: string,
  body: string,
  actions: NotificationAction[],
  metadata?: NotificationMetadata,
) {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'lg' },
          { type: 'text', text: body, wrap: true, margin: 'md' },
        ],
      },
      ...(actions.length > 0 && {
        footer: {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: actions.map((a) => ({
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'postback',
              label: a.label,
              data: buildLinePostbackData(a, metadata),
            },
          })),
        },
      }),
    },
  };
}

async function sendWebPush(
  subscription: NonNullable<GCSUserSettings['notification']['web_push_subscription']>,
  payload: {
    title: string;
    body: string;
    actions?: NotifyRequest['actions'];
    data?: NotificationMetadata;
  },
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webpush = require('web-push');
    webpush.setVapidDetails(
      'mailto:' + (process.env.VAPID_CONTACT_EMAIL || 'noreply@example.com'),
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
    );
    return true;
  } catch (e) {
    console.error('Web push failed:', e);
    return false;
  }
}

async function sendLine(
  lineUserId: string,
  title: string,
  body: string,
  actions: NotificationAction[],
  metadata?: NotificationMetadata,
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN not set');
    return false;
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [buildFlexMessage(title, body, actions, metadata)],
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('LINE push failed:', e);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: NotifyRequest = await request.json();
    const { user_id, title, body: messageBody, actions = [], metadata } = body;

    if (!user_id || !title || !messageBody) {
      return NextResponse.json({ error: 'user_id, title, and body are required' }, { status: 400 });
    }

    const settings = await readUserSettings();
    if (!settings) {
      return NextResponse.json({ error: 'User settings not found' }, { status: 404 });
    }

    const channels = settings.notification.channels;
    console.log(
      '[notify] channels:',
      channels,
      'has_sub:',
      !!settings.notification.web_push_subscription,
    );
    if (channels.length === 0) {
      console.log('[notify] No channels configured');
      return NextResponse.json({ channels_sent: [], status: 'failed' } satisfies NotifyResult);
    }

    const sent: string[] = [];

    const promises = channels.map(async (channel) => {
      if (channel === 'web_push' && settings.notification.web_push_subscription) {
        console.log('[notify] Sending web push...');
        const ok = await sendWebPush(settings.notification.web_push_subscription, {
          title,
          body: messageBody,
          actions,
          data: buildPushPayloadData(metadata),
        });
        console.log('[notify] Web push result:', ok);
        if (ok) sent.push('web_push');
      }

      if (channel === 'line' && settings.notification.line_user_id) {
        const ok = await sendLine(
          settings.notification.line_user_id,
          title,
          messageBody,
          actions,
          metadata,
        );
        if (ok) sent.push('line');
      }
    });

    await Promise.all(promises);

    const status: NotifyResult['status'] =
      sent.length === 0 ? 'failed' : sent.length === channels.length ? 'sent' : 'partial';

    await appendNotificationLog(
      buildNotificationLogRecord(
        { title, body: messageBody, actions, metadata },
        { channels_sent: sent, status },
      ),
    );

    return NextResponse.json({ channels_sent: sent, status } satisfies NotifyResult);
  } catch (error) {
    console.error('Notify API error:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { readAgentOperationLog } from '@/lib/gcs-settings';

function parseLimit(value: string | null): number {
  if (!value) return 50;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const logs = await readAgentOperationLog(
      parseLimit(url.searchParams.get('limit')),
      session.user.id,
    );
    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Agent operation logs API error:', error);
    return NextResponse.json({ logs: [] });
  }
}

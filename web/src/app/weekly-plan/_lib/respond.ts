export type ReviewAction = 'approve' | 'modify' | 'dismiss';

export interface RespondBody {
  review_id: string;
  action: ReviewAction;
  expected_plan_revision: number;
  user_message?: string;
}

export interface RespondResult {
  status: 'ok' | 'conflict' | 'error';
  message?: string;
  raw?: unknown;
}

export function buildRespondBody(
  reviewId: string,
  planRevision: number,
  action: ReviewAction,
  userMessage?: string,
): RespondBody {
  const body: RespondBody = {
    review_id: reviewId,
    action,
    expected_plan_revision: planRevision,
  };
  if (action === 'modify' && userMessage && userMessage.trim()) {
    body.user_message = userMessage.trim();
  }
  return body;
}

interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

export async function submitWeeklyResponse(
  body: RespondBody,
  fetchImpl: FetchLike = fetch,
): Promise<RespondResult> {
  let response: Response;
  try {
    response = await fetchImpl('/api/weekly-plan/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  let raw: unknown = null;
  try {
    raw = await response.json();
  } catch {
    raw = null;
  }

  if (response.status === 409 || (raw as { status?: string } | null)?.status === 'conflict') {
    return {
      status: 'conflict',
      message:
        (raw as { message?: string } | null)?.message ??
        'プランが更新されています。再読み込みしてからもう一度選んでください。',
      raw,
    };
  }

  if (!response.ok) {
    const message =
      typeof raw === 'object' && raw && 'error' in raw
        ? String((raw as { error: unknown }).error)
        : `HTTP ${response.status}`;
    return { status: 'error', message, raw };
  }

  return { status: 'ok', raw };
}

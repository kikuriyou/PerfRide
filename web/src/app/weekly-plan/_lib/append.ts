export interface AppendBody {
  session_date: string;
  session_type: string;
  duration_minutes: number;
  target_tss: number;
  notes?: string;
  expected_plan_revision: number;
}

export interface AppendResult {
  status: 'ok' | 'conflict' | 'error';
  message?: string;
  planRevision?: number;
  currentPlanRevision?: number;
  raw?: unknown;
}

interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

export async function submitAppend(
  body: AppendBody,
  fetchImpl: FetchLike = fetch,
): Promise<AppendResult> {
  let response: Response;
  try {
    response = await fetchImpl('/api/weekly-plan/append', {
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

  if (!response.ok) {
    const message =
      typeof raw === 'object' && raw && 'error' in raw
        ? String((raw as { error: unknown }).error)
        : `HTTP ${response.status}`;
    return { status: 'error', message, raw };
  }

  if (raw && typeof raw === 'object' && (raw as { status?: string }).status === 'conflict') {
    const current = (raw as { current_plan_revision?: number }).current_plan_revision;
    return {
      status: 'conflict',
      message: (raw as { message?: string }).message ?? 'plan revision conflict',
      currentPlanRevision: typeof current === 'number' ? current : undefined,
      raw,
    };
  }

  const newRevision = (raw as { plan_revision?: number } | null)?.plan_revision;
  return {
    status: 'ok',
    planRevision: typeof newRevision === 'number' ? newRevision : undefined,
    raw,
  };
}

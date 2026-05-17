import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { agentFetch } from '@/lib/agent';
import { recordAgentOperationLog } from '@/lib/agent-operation-log';
import { authOptions } from '@/lib/auth';
import { deleteGCSObject, readGCSJSON, userObjectPath, writeGCSJSON } from '@/lib/gcs-settings';
import type { AgentOperationLogStatus, GCSUserId } from '@/lib/gcs-settings';
import { encryptWithKms, getKmsKeyName, isKmsConfigured } from '@/lib/kms';

type VerificationStatus = 'verified' | 'failed' | 'missing' | 'skipped';

export interface IntervalsIcuVerification {
  ok: boolean;
  status: VerificationStatus;
  message: string;
  checked_at: string;
}

interface IntervalsIcuCredentialRecord {
  athlete_id: string;
  api_key_ciphertext: string;
  kms_key_name: string;
  updated_at: string;
  status: 'configured';
  verification?: IntervalsIcuVerification;
}

interface IntervalsIcuPostBody {
  api_key?: string;
  athlete_id?: string;
}

export function credentialPath(userId: string): string {
  return userObjectPath(userId, 'integrations/intervals_icu.json');
}

export function resolveIntervalsIcuSaveError(error: unknown): { message: string; status: number } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('KMS_KEY_NAME')) {
    return {
      message:
        'KMS_KEY_NAME is not set. Set it in web/.env.local or Cloud Run env to save the Intervals.icu API key.',
      status: 503,
    };
  }
  if (
    message.includes('KMS encrypt failed') ||
    message.includes('Failed to get KMS access token')
  ) {
    return {
      message:
        'KMS encryption failed. Check KMS_KEY_NAME and the Cloud KMS CryptoKey Encrypter role for the web service account.',
      status: 502,
    };
  }
  return { message: 'Failed to save Intervals.icu settings', status: 500 };
}

function normalizeVerification(data: unknown): IntervalsIcuVerification {
  const candidate = data as Partial<Omit<IntervalsIcuVerification, 'checked_at'>> | null;
  const status = candidate?.status;
  const normalizedStatus: VerificationStatus =
    status === 'verified' || status === 'failed' || status === 'missing' || status === 'skipped'
      ? status
      : 'failed';
  return {
    ok: Boolean(candidate?.ok),
    status: normalizedStatus,
    message:
      typeof candidate?.message === 'string'
        ? candidate.message
        : 'Intervals.icu connection check failed',
    checked_at: new Date().toISOString(),
  };
}

async function verifySavedIntervalsIcuCredential(
  userId: string,
): Promise<IntervalsIcuVerification> {
  try {
    const response = await agentFetch('/api/agent/intervals-icu/test', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        status: 'failed',
        message: 'Intervals.icu connection check failed through the agent service',
        checked_at: new Date().toISOString(),
      };
    }
    return normalizeVerification(data);
  } catch {
    return {
      ok: false,
      status: 'skipped',
      message: 'Intervals.icu connection check could not reach the agent service',
      checked_at: new Date().toISOString(),
    };
  }
}

export function intervalsIcuVerificationLogStatus(
  verification: IntervalsIcuVerification,
): AgentOperationLogStatus {
  if (verification.status === 'verified') return 'completed';
  if (verification.status === 'skipped') return 'skipped';
  return 'error';
}

export function intervalsIcuVerificationLogMessage(
  verification: IntervalsIcuVerification,
  action: 'save' | 'test' = 'save',
): string {
  const prefix = action === 'save' ? 'Intervals.icu settings save' : 'Intervals.icu verification';
  if (verification.status === 'verified') {
    return action === 'save'
      ? 'Intervals.icu settings saved and verified'
      : 'Intervals.icu verification succeeded';
  }
  if (verification.status === 'missing') {
    return `${prefix} could not verify the API key: ${verification.message}`;
  }
  if (verification.status === 'skipped') {
    return `${prefix} was skipped: ${verification.message}`;
  }
  return `${prefix} failed: ${verification.message}`;
}

async function recordIntervalsIcuVerificationLog(
  userId: GCSUserId,
  verification: IntervalsIcuVerification,
  trigger: string,
  action: 'save' | 'test',
): Promise<void> {
  await recordAgentOperationLog(userId, {
    status: intervalsIcuVerificationLogStatus(verification),
    operation: 'intervals_icu_settings',
    trigger,
    message: intervalsIcuVerificationLogMessage(verification, action),
    runId: `intervals-icu-settings-${Date.now().toString(36)}`,
    metadata: {
      verification_ok: verification.ok,
      verification_status: verification.status,
      checked_at: verification.checked_at,
    },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const record = await readGCSJSON<IntervalsIcuCredentialRecord>(credentialPath(session.user.id));
  return NextResponse.json({
    configured: Boolean(record?.api_key_ciphertext),
    athlete_id: record?.athlete_id ?? '0',
    updated_at: record?.updated_at ?? null,
    encryption_ready: isKmsConfigured(),
    verification: record?.verification ?? null,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as IntervalsIcuPostBody;
    const apiKey = body.api_key?.trim();
    const athleteId = body.athlete_id?.trim() || '0';
    if (!apiKey) {
      return NextResponse.json({ error: 'api_key is required' }, { status: 400 });
    }

    const record: IntervalsIcuCredentialRecord = {
      athlete_id: athleteId,
      api_key_ciphertext: await encryptWithKms(apiKey),
      kms_key_name: getKmsKeyName(),
      updated_at: new Date().toISOString(),
      status: 'configured',
    };
    await writeGCSJSON(credentialPath(session.user.id), record);
    return NextResponse.json({
      ok: true,
      configured: true,
      athlete_id: record.athlete_id,
      updated_at: record.updated_at,
      verification: null,
    });
  } catch (error) {
    console.error('Intervals.icu settings error:', error instanceof Error ? error.message : error);
    const resolved = resolveIntervalsIcuSaveError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function PUT() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const path = credentialPath(session.user.id);
  const record = await readGCSJSON<IntervalsIcuCredentialRecord>(path);
  if (!record?.api_key_ciphertext) {
    return NextResponse.json({ error: 'Intervals.icu API key is not configured' }, { status: 400 });
  }

  const verification = await verifySavedIntervalsIcuCredential(session.user.id);
  await writeGCSJSON(path, { ...record, verification });
  await recordIntervalsIcuVerificationLog(session.user.id, verification, 'settings_test', 'test');
  return NextResponse.json({
    ok: true,
    configured: true,
    athlete_id: record.athlete_id,
    updated_at: record.updated_at,
    encryption_ready: isKmsConfigured(),
    verification,
  });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await deleteGCSObject(credentialPath(session.user.id));
  return NextResponse.json({ ok: true, configured: false });
}

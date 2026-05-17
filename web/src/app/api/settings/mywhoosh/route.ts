import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { deleteGCSObject, readGCSJSON, userObjectPath, writeGCSJSON } from '@/lib/gcs-settings';
import { agentFetch } from '@/lib/agent';
import { recordAgentOperationLog } from '@/lib/agent-operation-log';
import type { AgentOperationLogStatus, GCSUserId } from '@/lib/gcs-settings';
import { encryptWithKms, getKmsKeyName, isKmsConfigured } from '@/lib/kms';

type VerificationStatus = 'verified' | 'failed' | 'missing' | 'skipped' | 'already_logged_in';

interface MyWhooshVerification {
  ok: boolean;
  status: VerificationStatus;
  message: string;
  checked_at: string;
}

interface MyWhooshCredentialRecord {
  email: string;
  password_ciphertext: string;
  kms_key_name: string;
  updated_at: string;
  status: 'configured';
  verification?: MyWhooshVerification;
}

interface MyWhooshPostBody {
  email?: string;
  password?: string;
}

function credentialPath(userId: string): string {
  return userObjectPath(userId, 'integrations/mywhoosh.json');
}

export function resolveMyWhooshSaveError(error: unknown): { message: string; status: number } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('KMS_KEY_NAME')) {
    return {
      message:
        'KMS_KEY_NAME is not set. Set it in web/.env.local or Cloud Run env to save MyWhoosh credentials.',
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
  return { message: 'Failed to save MyWhoosh settings', status: 500 };
}

function normalizeVerification(data: unknown): MyWhooshVerification {
  const candidate = data as Partial<Omit<MyWhooshVerification, 'checked_at'>> | null;
  const status = candidate?.status;
  const normalizedStatus: VerificationStatus =
    status === 'verified' ||
    status === 'failed' ||
    status === 'missing' ||
    status === 'skipped' ||
    status === 'already_logged_in'
      ? status
      : 'failed';
  return {
    ok: Boolean(candidate?.ok),
    status: normalizedStatus,
    message:
      typeof candidate?.message === 'string'
        ? candidate.message
        : 'MyWhoosh connection check failed',
    checked_at: new Date().toISOString(),
  };
}

async function verifySavedMyWhooshCredential(userId: string): Promise<MyWhooshVerification> {
  try {
    const response = await agentFetch('/api/agent/mywhoosh/test', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        status: 'failed',
        message: 'MyWhoosh connection check failed through the agent service',
        checked_at: new Date().toISOString(),
      };
    }
    return normalizeVerification(data);
  } catch {
    return {
      ok: false,
      status: 'skipped',
      message: 'MyWhoosh connection check could not reach the agent service',
      checked_at: new Date().toISOString(),
    };
  }
}

export function myWhooshVerificationLogStatus(
  verification: MyWhooshVerification,
): AgentOperationLogStatus {
  if (verification.status === 'verified') return 'completed';
  if (verification.status === 'skipped') return 'skipped';
  return 'error';
}

export function myWhooshVerificationLogMessage(
  verification: MyWhooshVerification,
  action: 'save' | 'test' = 'save',
): string {
  const prefix = action === 'save' ? 'MyWhoosh settings save' : 'MyWhoosh login check';
  if (verification.status === 'verified') {
    return action === 'save'
      ? 'MyWhoosh settings saved and login check succeeded'
      : 'MyWhoosh login check succeeded';
  }
  if (verification.status === 'already_logged_in') {
    return `${prefix} could not complete because another device is already logged in: ${verification.message}`;
  }
  if (verification.status === 'missing') {
    return `${prefix} could not verify the credentials: ${verification.message}`;
  }
  if (verification.status === 'skipped') {
    return `${prefix} was skipped: ${verification.message}`;
  }
  return `${prefix} failed: ${verification.message}`;
}

async function recordMyWhooshVerificationLog(
  userId: GCSUserId,
  verification: MyWhooshVerification,
  trigger: string,
  action: 'save' | 'test',
): Promise<void> {
  await recordAgentOperationLog(userId, {
    status: myWhooshVerificationLogStatus(verification),
    operation: 'mywhoosh_settings',
    trigger,
    message: myWhooshVerificationLogMessage(verification, action),
    runId: `mywhoosh-settings-${Date.now().toString(36)}`,
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

  const record = await readGCSJSON<MyWhooshCredentialRecord>(credentialPath(session.user.id));
  return NextResponse.json({
    configured: Boolean(record?.password_ciphertext),
    email: record?.email ?? '',
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
    const body = (await request.json()) as MyWhooshPostBody;
    const email = body.email?.trim();
    const password = body.password ?? '';
    if (!email || !password) {
      return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
    }

    const record: MyWhooshCredentialRecord = {
      email,
      password_ciphertext: await encryptWithKms(password),
      kms_key_name: getKmsKeyName(),
      updated_at: new Date().toISOString(),
      status: 'configured',
    };
    await writeGCSJSON(credentialPath(session.user.id), record);
    return NextResponse.json({
      ok: true,
      configured: true,
      email: record.email,
      updated_at: record.updated_at,
      verification: null,
    });
  } catch (error) {
    console.error('MyWhoosh settings error:', error instanceof Error ? error.message : error);
    const resolved = resolveMyWhooshSaveError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function PUT() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const path = credentialPath(session.user.id);
  const record = await readGCSJSON<MyWhooshCredentialRecord>(path);
  if (!record?.password_ciphertext) {
    return NextResponse.json({ error: 'MyWhoosh credentials are not configured' }, { status: 400 });
  }

  const verification = await verifySavedMyWhooshCredential(session.user.id);
  await writeGCSJSON(path, { ...record, verification });
  await recordMyWhooshVerificationLog(session.user.id, verification, 'settings_test', 'test');
  return NextResponse.json({
    ok: true,
    configured: true,
    email: record.email,
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

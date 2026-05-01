import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import {
  deleteGCSObject,
  readGCSJSON,
  userObjectPath,
  writeGCSJSON,
} from '@/lib/gcs-settings';
import { agentFetch } from '@/lib/agent';
import { encryptWithKms, getKmsKeyName, isKmsConfigured } from '@/lib/kms';

type VerificationStatus = 'verified' | 'failed' | 'missing' | 'skipped';

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
        'KMS_KEY_NAME が未設定です。MyWhoosh 認証情報を保存するには web/.env.local または Cloud Run env に KMS_KEY_NAME を設定してください。',
      status: 503,
    };
  }
  if (message.includes('KMS encrypt failed') || message.includes('Failed to get KMS access token')) {
    return {
      message:
        'KMS 暗号化に失敗しました。KMS_KEY_NAME と web service account の Cloud KMS CryptoKey Encrypter 権限を確認してください。',
      status: 502,
    };
  }
  return { message: 'Failed to save MyWhoosh settings', status: 500 };
}

function normalizeVerification(data: unknown): MyWhooshVerification {
  const candidate = data as Partial<Omit<MyWhooshVerification, 'checked_at'>> | null;
  const status = candidate?.status;
  const normalizedStatus: VerificationStatus =
    status === 'verified' || status === 'failed' || status === 'missing' ? status : 'failed';
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
    const verification = await verifySavedMyWhooshCredential(session.user.id);
    const verifiedRecord = { ...record, verification };
    await writeGCSJSON(credentialPath(session.user.id), verifiedRecord);
    return NextResponse.json({
      ok: true,
      configured: true,
      email: record.email,
      updated_at: record.updated_at,
      verification,
    });
  } catch (error) {
    console.error('MyWhoosh settings error:', error instanceof Error ? error.message : error);
    const resolved = resolveMyWhooshSaveError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await deleteGCSObject(credentialPath(session.user.id));
  return NextResponse.json({ ok: true, configured: false });
}

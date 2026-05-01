interface KmsEncryptResponse {
  ciphertext?: string;
}

export function getKmsKeyName(): string {
  const value = process.env.KMS_KEY_NAME?.trim();
  if (!value) {
    throw new Error('KMS_KEY_NAME is not set');
  }
  return value;
}

export function isKmsConfigured(): boolean {
  return Boolean(process.env.KMS_KEY_NAME?.trim());
}

export async function encryptWithKms(plaintext: string): Promise<string> {
  const keyName = getKmsKeyName();
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === 'string' ? token : token.token;
  if (!accessToken) throw new Error('Failed to get KMS access token');

  const res = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:encrypt`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plaintext: Buffer.from(plaintext, 'utf-8').toString('base64'),
    }),
  });
  if (!res.ok) {
    throw new Error(`KMS encrypt failed: ${res.status}`);
  }
  const data = (await res.json()) as KmsEncryptResponse;
  if (!data.ciphertext) throw new Error('KMS encrypt response missing ciphertext');
  return data.ciphertext;
}

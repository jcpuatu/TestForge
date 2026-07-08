import crypto from 'crypto';

export function generateOpaqueToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateApiKey(): { raw: string; prefix: string } {
  const raw = `tf_${generateOpaqueToken(24)}`;
  const prefix = raw.slice(0, 12);
  return { raw, prefix };
}

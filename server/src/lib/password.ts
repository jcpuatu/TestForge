import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A syntactically-real bcrypt hash (same cost factor as every real password) that no login can
// ever match — used only so a login attempt against a nonexistent email still pays the same
// bcrypt.compare cost as one against a real account. Computed once at module load (not per
// request), never persisted, never compared against anything but a caller who doesn't exist.
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomUUID(), SALT_ROUNDS);

import crypto from 'crypto';
import type { Response } from 'express';
import { prisma } from '../../config/prisma-client';
import { env } from '../../config/env';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../lib/password';
import { signAccessToken } from '../../lib/jwt';
import { generateOpaqueToken, hashToken } from '../../lib/tokens';
import { UnauthorizedError } from '../../lib/errors';
import type { Role } from '../../types/roles';
import type { User } from '@prisma/client';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function refreshExpiry(): Date {
  return new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

function setRefreshCookie(res: Response, rawToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

export function getRefreshCookie(cookies: Record<string, string | undefined>): string | undefined {
  return cookies[REFRESH_COOKIE_NAME];
}

async function issueNewFamily(user: User, res: Response, ip: string | undefined) {
  const familyId = crypto.randomUUID();
  const rawToken = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      familyId,
      tokenHash: hashToken(rawToken),
      expiresAt: refreshExpiry(),
      createdByIp: ip,
    },
  });
  setRefreshCookie(res, rawToken);
  return { accessToken: signAccessToken({ sub: user.id, role: user.role as Role }) };
}

export async function login(email: string, password: string, res: Response, ip: string | undefined) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // bcrypt.compare always runs — against the real hash if the user exists, against a fixed dummy
  // hash otherwise — so a nonexistent email doesn't return early and short-circuit the ~450ms
  // bcrypt cost. Without this, a timing measurement alone (no password guessing needed) reliably
  // distinguished a real account from a fake one: a confirmed, measured ~120x gap (see git
  // history / CLAUDE.md) between an existing-email failure and a nonexistent-email failure.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !user.isActive || !valid) {
    throw new UnauthorizedError('Invalid email or password');
  }
  const tokens = await issueNewFamily(user, res, ip);
  return { user, ...tokens };
}

export async function refresh(rawToken: string | undefined, res: Response, ip: string | undefined) {
  if (!rawToken) {
    throw new UnauthorizedError('Missing refresh token');
  }
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (existing.revokedAt || existing.expiresAt < new Date()) {
    // Reuse of an already-rotated (or expired) token — treat as compromise, kill the whole family.
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedError('Refresh token reuse detected — all sessions revoked');
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user || !user.isActive) {
    throw new UnauthorizedError('User account is inactive');
  }

  const rawNewToken = generateOpaqueToken();
  const newToken = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      familyId: existing.familyId,
      tokenHash: hashToken(rawNewToken),
      expiresAt: refreshExpiry(),
      createdByIp: ip,
    },
  });

  // Atomically "claim" the token being rotated. The revokedAt:null guard means that if two
  // genuinely concurrent requests both read the same not-yet-rotated token above (the read on
  // line ~71 is not itself a lock), only one of their updateMany calls can actually flip it —
  // the loser's `count` comes back 0. The plain revokedAt/expiresAt check earlier in this
  // function only catches SEQUENTIAL replay (a stale token presented after rotation already
  // committed); without this atomic claim, two simultaneous requests for the same token both
  // read it as valid and both successfully rotate it, and reuse-detection never fires at all.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date(), replacedByTokenId: newToken.id },
  });

  if (claimed.count === 0) {
    // Lost the race — some other concurrent request already rotated this exact token first.
    // Treat it exactly like sequential reuse: kill the whole family, including the token this
    // call just created, so a genuine race (multiple tabs, or an actual attacker) can't leave
    // either side with a working session.
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedError('Refresh token reuse detected — all sessions revoked');
  }

  setRefreshCookie(res, rawNewToken);
  return { accessToken: signAccessToken({ sub: user.id, role: user.role as Role }), user };
}

export async function logout(rawToken: string | undefined, res: Response) {
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearRefreshCookie(res);
}

import crypto from 'crypto';
import type { Response } from 'express';
import { prisma } from '../../config/prisma-client';
import { env } from '../../config/env';
import { verifyPassword } from '../../lib/password';
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
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid email or password');
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
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
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedByTokenId: newToken.id },
  });

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

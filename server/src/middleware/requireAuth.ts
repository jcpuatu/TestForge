import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma-client';
import { verifyAccessToken } from '../lib/jwt';
import { hashToken } from '../lib/tokens';
import { UnauthorizedError } from '../lib/errors';
import { asyncHandler } from '../lib/asyncHandler';
import type { Role } from '../types/roles';

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError();
  }
  const token = header.slice('Bearer '.length).trim();

  if (token.startsWith('tf_')) {
    const keyHash = hashToken(token);
    const apiKey = await prisma.apiKey.findUnique({ where: { keyHash }, include: { user: true } });
    if (!apiKey || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
      throw new UnauthorizedError('Invalid or revoked API key');
    }
    if (!apiKey.user.isActive) {
      throw new UnauthorizedError('User account is inactive');
    }
    await prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
    req.user = { id: apiKey.user.id, role: apiKey.user.role as Role, authMethod: 'apiKey' };
    return next();
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }

  // Re-read the user on every request rather than trusting the token's embedded id/role for its
  // whole (~15min) lifetime — the API-key branch above already does this per request for the
  // same reason. Without it, deactivating or demoting a user had no effect on anyone already
  // holding a live access token until that token naturally expired: a confirmed, reproduced gap
  // (a deactivated ADMIN's token kept returning 200 on admin-only routes; a demoted ADMIN's token
  // kept its old role). Always use the DB's current role, never payload.role, so a role change
  // takes effect immediately, not on the token's own schedule.
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw new UnauthorizedError('User account is inactive');
  }
  req.user = { id: user.id, role: user.role as Role, authMethod: 'jwt' };
  return next();
});

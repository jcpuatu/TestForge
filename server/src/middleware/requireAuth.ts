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

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, authMethod: 'jwt' };
    return next();
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
});

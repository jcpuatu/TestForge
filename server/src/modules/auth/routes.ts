import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { loginRateLimiter } from '../../middleware/rateLimit';
import { prisma } from '../../config/prisma-client';
import { UnauthorizedError } from '../../lib/errors';
import { loginSchema } from './schema';
import * as authService from './service';

export const authRouter = Router();

function toPublicUser(user: { id: string; email: string; name: string; role: string; isActive: boolean }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive };
}

authRouter.post(
  '/login',
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const { user, accessToken } = await authService.login(email, password, res, req.ip);
    res.json({ accessToken, user: toPublicUser(user) });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const rawToken = authService.getRefreshCookie(req.cookies);
    const { accessToken, user } = await authService.refresh(rawToken, res, req.ip);
    res.json({ accessToken, user: toPublicUser(user) });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const rawToken = authService.getRefreshCookie(req.cookies);
    await authService.logout(rawToken, res);
    res.status(204).send();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      throw new UnauthorizedError();
    }
    res.json({ user: toPublicUser(user) });
  }),
);

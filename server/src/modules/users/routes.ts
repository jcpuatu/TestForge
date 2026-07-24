import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';
import { generateApiKey, hashToken } from '../../lib/tokens';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { createApiKeySchema, createUserSchema, updateUserSchema } from './schema';

export const usersRouter = Router();

function toPublicUser(user: { id: string; email: string; name: string; role: string; isActive: boolean; createdAt: Date }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive, createdAt: user.createdAt };
}

usersRouter.use(requireAuth);

// Any authenticated user can see the active-user directory (id/name/role only) —
// needed to populate "assign to" pickers without exposing email/creation-date
// like the full admin listing below does.
usersRouter.get(
  '/directory',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  }),
);

usersRouter.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ users: users.map(toPublicUser) });
  }),
);

usersRouter.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    // Normalized to lowercase before every lookup/write, same pattern this codebase already
    // uses for Label names — SQLite's default collation is case-sensitive, so without this
    // "Test@x.com" and "test@x.com" were two different, both-loginable accounts.
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestError('A user with that email already exists');
    }
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: { email, name: body.name, role: body.role, passwordHash },
    });
    res.status(201).json({ user: toPublicUser(user) });
  }),
);

usersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new ForbiddenError();
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new NotFoundError('User');
    res.json({ user: toPublicUser(user) });
  }),
);

// True only when `target` is currently an active ADMIN and the incoming change would make them
// stop being one (role change away from ADMIN, or deactivation) — used to guard both the role/
// isActive PATCH and the deactivate-on-DELETE below against leaving the project with zero admins.
function wouldLoseAdminStatus(target: { role: string; isActive: boolean }, patch: { role?: string; isActive?: boolean }): boolean {
  if (target.role !== 'ADMIN' || !target.isActive) return false;
  const staysAdmin = (patch.role ?? target.role) === 'ADMIN' && (patch.isActive ?? target.isActive);
  return !staysAdmin;
}

async function assertOtherActiveAdminExists(excludingUserId: string) {
  const otherActiveAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true, id: { not: excludingUserId } } });
  if (otherActiveAdmins === 0) {
    throw new BadRequestError('Cannot remove the last remaining admin — promote another user to ADMIN first');
  }
}

usersRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const body = updateUserSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new NotFoundError('User');
    if (wouldLoseAdminStatus(target, body)) {
      await assertOtherActiveAdminExists(target.id);
    }
    const data: Record<string, unknown> = { ...body };
    delete data.password;
    if (body.password) {
      data.passwordHash = await hashPassword(body.password);
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ user: toPublicUser(user) });
  }),
);

usersRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new NotFoundError('User');
    if (wouldLoseAdminStatus(target, { isActive: false })) {
      await assertOtherActiveAdminExists(target.id);
    }
    await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).send();
  }),
);

usersRouter.get(
  '/:id/api-keys',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new ForbiddenError();
    }
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      apiKeys: keys.map((k) => ({
        id: k.id,
        label: k.label,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
      })),
    });
  }),
);

usersRouter.post(
  '/:id/api-keys',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new ForbiddenError();
    }
    const body = createApiKeySchema.parse(req.body);
    const { raw, prefix } = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        userId: req.params.id,
        label: body.label,
        keyPrefix: prefix,
        keyHash: hashToken(raw),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    // Raw key is only ever shown once, at creation time.
    res.status(201).json({ apiKey: { id: apiKey.id, label: apiKey.label, key: raw, keyPrefix: prefix } });
  }),
);

usersRouter.delete(
  '/:id/api-keys/:keyId',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new ForbiddenError();
    }
    // Scoped by userId too, not just id — without this, any caller who can reach this route for
    // their OWN :id (i.e. anyone) could revoke a DIFFERENT user's key by passing that key's id as
    // :keyId, since the ownership check above only verifies the caller owns :id, never that
    // :keyId actually belongs to it. updateMany + a 0-count check makes "not found" and
    // "not yours" indistinguishable to the caller, which is the correct behavior here.
    const { count } = await prisma.apiKey.updateMany({
      where: { id: req.params.keyId, userId: req.params.id },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundError('API key');
    res.status(204).send();
  }),
);

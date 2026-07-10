import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { createConfigGroupSchema, createConfigSchema, updateConfigGroupSchema, updateConfigSchema } from './schema';

const MANAGE_ROLES = ['ADMIN', 'LEAD'] as const;

async function assertGroupNameAvailable(projectId: string, name: string, excludeId?: string) {
  const existing = await prisma.configGroup.findMany({ where: { projectId } });
  const clash = existing.find((g) => g.id !== excludeId && g.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new BadRequestError(`A configuration group named "${clash.name}" already exists in this project`);
}

async function assertConfigNameAvailable(configGroupId: string, name: string, excludeId?: string) {
  const existing = await prisma.config.findMany({ where: { configGroupId } });
  const clash = existing.find((c) => c.id !== excludeId && c.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new BadRequestError(`A configuration named "${clash.name}" already exists in this group`);
}

// Mounted at /api/v1/projects/:projectId/config-groups
export const configGroupsNestedRouter = Router({ mergeParams: true });
configGroupsNestedRouter.use(requireAuth);

configGroupsNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const groups = await prisma.configGroup.findMany({
      where: { projectId: req.params.projectId },
      include: { configs: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json({ configGroups: groups });
  }),
);

configGroupsNestedRouter.post(
  '/',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createConfigGroupSchema.parse(req.body);
    await assertGroupNameAvailable(req.params.projectId, body.name);
    const group = await prisma.configGroup.create({
      data: {
        projectId: req.params.projectId,
        name: body.name,
        configs: body.configs ? { create: body.configs.map((name) => ({ name })) } : undefined,
      },
      include: { configs: true },
    });
    res.status(201).json({ configGroup: group });
  }),
);

// Mounted at /api/v1/config-groups
export const configGroupsRouter = Router();
configGroupsRouter.use(requireAuth);

configGroupsRouter.patch(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.configGroup.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Configuration group');
    const body = updateConfigGroupSchema.parse(req.body);
    await assertGroupNameAvailable(existing.projectId, body.name, existing.id);
    const group = await prisma.configGroup.update({ where: { id: req.params.id }, data: { name: body.name } });
    res.json({ configGroup: group });
  }),
);

configGroupsRouter.delete(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    // Cascades Config automatically. Runs already created from a since-deleted config keep their
    // configLabel (a plain string snapshot, not a live foreign key) — matches the same
    // snapshot-not-live-link discipline used everywhere else runs touch source data.
    await prisma.configGroup.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

configGroupsRouter.post(
  '/:id/configs',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const group = await prisma.configGroup.findUnique({ where: { id: req.params.id } });
    if (!group) throw new NotFoundError('Configuration group');
    const body = createConfigSchema.parse(req.body);
    await assertConfigNameAvailable(group.id, body.name);
    const config = await prisma.config.create({ data: { configGroupId: group.id, name: body.name } });
    res.status(201).json({ config });
  }),
);

// Mounted at /api/v1/configs
export const configsRouter = Router();
configsRouter.use(requireAuth);

configsRouter.patch(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.config.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Configuration');
    const body = updateConfigSchema.parse(req.body);
    await assertConfigNameAvailable(existing.configGroupId, body.name, existing.id);
    const config = await prisma.config.update({ where: { id: req.params.id }, data: { name: body.name } });
    res.json({ config });
  }),
);

configsRouter.delete(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.config.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

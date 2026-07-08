import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { createSectionSchema, updateSectionSchema } from './schema';

// Mounted at /api/v1/suites/:suiteId/sections
export const sectionsNestedRouter = Router({ mergeParams: true });
sectionsNestedRouter.use(requireAuth);

sectionsNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const sections = await prisma.section.findMany({
      where: { suiteId: req.params.suiteId },
      orderBy: { orderIndex: 'asc' },
    });
    res.json({ sections });
  }),
);

sectionsNestedRouter.post(
  '/',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = createSectionSchema.parse(req.body);
    const section = await prisma.section.create({ data: { ...body, suiteId: req.params.suiteId } });
    res.status(201).json({ section });
  }),
);

// Mounted at /api/v1/sections
export const sectionsRouter = Router();
sectionsRouter.use(requireAuth);

sectionsRouter.patch(
  '/:id',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = updateSectionSchema.parse(req.body);
    const section = await prisma.section.update({ where: { id: req.params.id }, data: body });
    res.json({ section });
  }),
);

sectionsRouter.delete(
  '/:id',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const section = await prisma.section.findUnique({ where: { id: req.params.id } });
    if (!section) throw new NotFoundError('Section');

    await prisma.$transaction([
      // Reparent children up one level before deleting (self-relation is onDelete: Restrict).
      prisma.section.updateMany({ where: { parentId: section.id }, data: { parentId: section.parentId } }),
      prisma.section.delete({ where: { id: section.id } }),
    ]);
    res.status(204).send();
  }),
);

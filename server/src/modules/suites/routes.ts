import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { createSuiteSchema, updateSuiteSchema } from './schema';

// Mounted at /api/v1/projects/:projectId/suites
export const suitesNestedRouter = Router({ mergeParams: true });
suitesNestedRouter.use(requireAuth);

suitesNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const suites = await prisma.suite.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { cases: true } } },
    });
    res.json({ suites });
  }),
);

suitesNestedRouter.post(
  '/',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = createSuiteSchema.parse(req.body);
    const suite = await prisma.suite.create({ data: { ...body, projectId: req.params.projectId } });
    res.status(201).json({ suite });
  }),
);

// Mounted at /api/v1/suites
export const suitesRouter = Router();
suitesRouter.use(requireAuth);

suitesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const suite = await prisma.suite.findUnique({
      where: { id: req.params.id },
      include: { sections: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!suite) throw new NotFoundError('Suite');
    res.json({ suite });
  }),
);

suitesRouter.patch(
  '/:id',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = updateSuiteSchema.parse(req.body);
    const suite = await prisma.suite.update({ where: { id: req.params.id }, data: body });
    res.json({ suite });
  }),
);

suitesRouter.delete(
  '/:id',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    await prisma.suite.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

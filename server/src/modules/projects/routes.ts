import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { createProjectSchema, updateProjectSchema } from './schema';

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { suites: true, runs: true } } },
    });
    res.json({ projects });
  }),
);

projectsRouter.post(
  '/',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = createProjectSchema.parse(req.body);
    const project = await prisma.project.create({ data: body });
    res.status(201).json({ project });
  }),
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { suites: { orderBy: { createdAt: 'asc' } } },
    });
    if (!project) throw new NotFoundError('Project');
    res.json({ project });
  }),
);

projectsRouter.patch(
  '/:id',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = updateProjectSchema.parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.isCompleted === true) data.completedAt = new Date();
    if (body.isCompleted === false) data.completedAt = null;
    const project = await prisma.project.update({ where: { id: req.params.id }, data });
    res.json({ project });
  }),
);

projectsRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

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

// Impact preview for the delete-confirmation UI — deleting a project cascades to
// everything (Suite/Milestone/TestPlan/TestRun/Webhook all onDelete: Cascade from Project).
projectsRouter.get(
  '/:id/delete-impact',
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) throw new NotFoundError('Project');

    const [suiteCount, caseCount, runCount, planCount, milestoneCount] = await Promise.all([
      prisma.suite.count({ where: { projectId: project.id } }),
      prisma.testCase.count({ where: { suite: { projectId: project.id } } }),
      prisma.testRun.count({ where: { projectId: project.id } }),
      prisma.testPlan.count({ where: { projectId: project.id } }),
      prisma.milestone.count({ where: { projectId: project.id } }),
    ]);

    res.json({ suiteCount, caseCount, runCount, planCount, milestoneCount });
  }),
);

projectsRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    // Section and Milestone both self-relate via parentId with onDelete: Restrict — cascading
    // through Project -> Suite -> Section (or Project -> Milestone) has no defined
    // child-before-parent order, so a project with any nested section/milestone would
    // otherwise hit that Restrict constraint. Null out the parent links first.
    await prisma.section.updateMany({ where: { suite: { projectId: req.params.id } }, data: { parentId: null } });
    await prisma.milestone.updateMany({ where: { projectId: req.params.id }, data: { parentId: null } });
    await prisma.project.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

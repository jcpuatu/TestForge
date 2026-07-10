import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { createSuiteSchema, updateSuiteSchema } from './schema';
import { logAudit } from '../../lib/audit';

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

// Impact preview for the delete-confirmation UI: mirrors what onDelete: Cascade will actually do
// (permanently remove cases + active runs, since TestRun.suiteId is SetNull not Cascade but the
// UI should still warn that those runs lose their suite link) — matches real TestRail's own
// suite-delete warning, which recommends closing runs first to preserve them.
suitesRouter.get(
  '/:id/delete-impact',
  asyncHandler(async (req, res) => {
    const suite = await prisma.suite.findUnique({ where: { id: req.params.id } });
    if (!suite) throw new NotFoundError('Suite');

    const [caseCount, activeRunCount, closedRunCount] = await Promise.all([
      prisma.testCase.count({ where: { suiteId: suite.id, isDeleted: false } }),
      prisma.testRun.count({ where: { suiteId: suite.id, isCompleted: false } }),
      prisma.testRun.count({ where: { suiteId: suite.id, isCompleted: true } }),
    ]);

    res.json({ caseCount, activeRunCount, closedRunCount });
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
    const suite = await prisma.suite.findUnique({ where: { id: req.params.id } });
    if (!suite) throw new NotFoundError('Suite');
    // Matches real TestRail: deleting a suite permanently removes its cases (via onDelete:
    // Cascade on Section/TestCase below) AND its active runs+results, but preserves closed
    // runs (suiteId is nulled via TestRun's onDelete: SetNull instead of being deleted).
    await prisma.testRun.deleteMany({ where: { suiteId: req.params.id, isCompleted: false } });
    // Section.parent uses onDelete: Restrict for the self-relation (nesting), but the DB's
    // cascade from Suite -> Section has no defined child-before-parent order — cascading
    // through a suite with nested sections can otherwise hit that Restrict constraint. Null
    // out the parent links first so the cascade below has nothing left to restrict on.
    await prisma.section.updateMany({ where: { suiteId: req.params.id }, data: { parentId: null } });
    await prisma.suite.delete({ where: { id: req.params.id } });
    await logAudit({
      projectId: suite.projectId,
      actorId: req.user!.id,
      action: 'SUITE_DELETED',
      entityType: 'Suite',
      entityId: suite.id,
      summary: `Deleted suite "${suite.name}"`,
    });
    res.status(204).send();
  }),
);

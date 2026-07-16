import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { createSharedStepSetSchema, promoteSharedStepsSchema, updateSharedStepSetSchema } from './schema';
import { addCaseSharedStep } from './service';

const MANAGE_ROLES = ['ADMIN', 'LEAD'] as const;
const WRITE_ROLES = ['ADMIN', 'LEAD', 'TESTER'] as const;

function toPublicSet(set: { id: string; projectId: string; name: string; steps: string; createdAt: Date; updatedAt: Date; _count?: { caseLinks: number } }) {
  return { ...set, steps: JSON.parse(set.steps), caseCount: set._count?.caseLinks ?? 0 };
}

async function assertNameAvailable(projectId: string, name: string, excludeId?: string) {
  const existing = await prisma.sharedStepSet.findMany({ where: { projectId } });
  const clash = existing.find((s) => s.id !== excludeId && s.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new BadRequestError(`A shared step set named "${clash.name}" already exists in this project`);
}

// Mounted at /api/v1/projects/:projectId/shared-step-sets
export const sharedStepSetsNestedRouter = Router({ mergeParams: true });
sharedStepSetsNestedRouter.use(requireAuth);

sharedStepSetsNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const sets = await prisma.sharedStepSet.findMany({
      where: { projectId: req.params.projectId },
      include: { _count: { select: { caseLinks: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ sharedStepSets: sets.map(toPublicSet) });
  }),
);

sharedStepSetsNestedRouter.post(
  '/',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createSharedStepSetSchema.parse(req.body);
    await assertNameAvailable(req.params.projectId, body.name);
    const set = await prisma.sharedStepSet.create({
      data: { projectId: req.params.projectId, name: body.name, steps: JSON.stringify(body.steps) },
    });
    res.status(201).json({ sharedStepSet: toPublicSet(set) });
  }),
);

// Mounted at /api/v1/shared-step-sets
export const sharedStepSetsRouter = Router();
sharedStepSetsRouter.use(requireAuth);

sharedStepSetsRouter.patch(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.sharedStepSet.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Shared step set');
    const body = updateSharedStepSetSchema.parse(req.body);
    if (body.name) await assertNameAvailable(existing.projectId, body.name, existing.id);
    // Editing steps here is exactly the "live-linked" propagation this feature exists for —
    // every case's TestCaseSharedSteps join row still points at this same set id, so a
    // resolved read (CaseForm display, or resolveStepsForCases at run-creation time) picks up
    // the new content automatically, no per-case update needed.
    const set = await prisma.sharedStepSet.update({
      where: { id: req.params.id },
      data: { name: body.name, steps: body.steps ? JSON.stringify(body.steps) : undefined },
    });
    res.json({ sharedStepSet: toPublicSet(set) });
  }),
);

sharedStepSetsRouter.get(
  '/:id/delete-impact',
  asyncHandler(async (req, res) => {
    const caseCount = await prisma.testCaseSharedSteps.count({ where: { sharedStepSetId: req.params.id } });
    res.json({ caseCount });
  }),
);

sharedStepSetsRouter.delete(
  '/:id',
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    // Cascades TestCaseSharedSteps automatically — cases using this set keep their own literal
    // steps (if any) but lose this shared block, matching the Label-delete precedent.
    await prisma.sharedStepSet.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

// Mounted at /api/v1/cases/:id/promote-shared-steps — turns a case's current literal steps into
// a new, reusable SharedStepSet and immediately attaches it in place of them. Real TestRail lets
// you promote an arbitrary consecutive *range* of a case's steps; TestForge simplifies this to
// "promote everything the case currently has" (documented scope reduction, not an oversight).
export const promoteSharedStepsRouter = Router({ mergeParams: true });
promoteSharedStepsRouter.use(requireAuth);

promoteSharedStepsRouter.post(
  '/',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
    if (!testCase) throw new NotFoundError('Test case');
    if (!testCase.steps) throw new BadRequestError('This case has no steps to promote');

    const body = promoteSharedStepsSchema.parse(req.body);
    const suite = await prisma.suite.findUniqueOrThrow({ where: { id: testCase.suiteId } });
    await assertNameAvailable(suite.projectId, body.name);

    const [set] = await prisma.$transaction([
      prisma.sharedStepSet.create({ data: { projectId: suite.projectId, name: body.name, steps: testCase.steps! } }),
      prisma.testCase.update({ where: { id: testCase.id }, data: { steps: null } }),
    ]);
    await addCaseSharedStep(testCase.id, set.id);

    res.status(201).json({ sharedStepSet: toPublicSet(set) });
  }),
);

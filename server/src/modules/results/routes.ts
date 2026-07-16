import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { toPublicRunCase } from '../runs/serialize';
import { assertRunIsOpen } from '../runs/service';
import { assertUserExists } from '../../lib/assertions';
import { createResultSchema, reassignSchema } from './schema';

const WRITE_ROLES = ['ADMIN', 'LEAD', 'TESTER'] as const;

// Mounted at /api/v1/tests
export const testsRouter = Router();
testsRouter.use(requireAuth);

testsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const runCase = await prisma.runCase.findUnique({
      where: { id: req.params.id },
      include: { assignedTo: { select: { id: true, name: true } } },
    });
    if (!runCase) throw new NotFoundError('Test');
    res.json({ test: toPublicRunCase(runCase) });
  }),
);

testsRouter.patch(
  '/:id',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const body = reassignSchema.parse(req.body);
    const existing = await prisma.runCase.findUnique({ where: { id: req.params.id }, select: { runId: true } });
    if (!existing) throw new NotFoundError('Test');
    await assertRunIsOpen(existing.runId);
    if (body.assignedToId) await assertUserExists(body.assignedToId);
    const runCase = await prisma.runCase.update({ where: { id: req.params.id }, data: body });
    res.json({ test: toPublicRunCase(runCase) });
  }),
);

function toPublicResult(result: { stepResults: string | null; [key: string]: unknown }) {
  return { ...result, stepResults: result.stepResults ? JSON.parse(result.stepResults) : null };
}

testsRouter.get(
  '/:id/results',
  asyncHandler(async (req, res) => {
    const results = await prisma.result.findMany({
      where: { runCaseId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: { enteredBy: { select: { id: true, name: true } } },
    });
    res.json({ results: results.map(toPublicResult) });
  }),
);

testsRouter.post(
  '/:id/results',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const { stepResults, ...body } = createResultSchema.parse(req.body);
    const runCase = await prisma.runCase.findUnique({ where: { id: req.params.id } });
    if (!runCase) throw new NotFoundError('Test');
    await assertRunIsOpen(runCase.runId);

    const [result] = await prisma.$transaction([
      prisma.result.create({
        data: { ...body, stepResults: stepResults ? JSON.stringify(stepResults) : undefined, runCaseId: runCase.id, enteredById: req.user!.id },
      }),
      prisma.runCase.update({ where: { id: runCase.id }, data: { status: body.status } }),
    ]);

    res.status(201).json({ result: toPublicResult(result) });
  }),
);

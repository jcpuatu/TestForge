import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { prisma } from '../../config/prisma-client';
import { toPublicRunCase } from '../runs/serialize';

// Mounted at /api/v1/me
export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get(
  '/tests',
  asyncHandler(async (req, res) => {
    const runCases = await prisma.runCase.findMany({
      where: { assignedToId: req.user!.id, run: { isCompleted: false } },
      orderBy: { createdAt: 'desc' },
      include: {
        run: { select: { id: true, name: true, projectId: true, project: { select: { name: true } } } },
      },
    });
    res.json({ tests: runCases.map(toPublicRunCase) });
  }),
);

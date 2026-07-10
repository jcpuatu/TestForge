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
    // ?userId lets ADMIN/LEAD view another team member's TODO list; anyone else always sees
    // only their own, regardless of what's passed.
    const canViewOthers = req.user!.role === 'ADMIN' || req.user!.role === 'LEAD';
    const targetUserId = canViewOthers && typeof req.query.userId === 'string' ? req.query.userId : req.user!.id;

    const runCases = await prisma.runCase.findMany({
      where: { assignedToId: targetUserId, run: { isCompleted: false } },
      orderBy: { createdAt: 'desc' },
      include: {
        run: {
          select: {
            id: true,
            name: true,
            projectId: true,
            project: { select: { name: true } },
            startDate: true,
            plan: { select: { startDate: true } },
            milestone: { select: { startDate: true } },
          },
        },
      },
    });
    res.json({ tests: runCases.map(toPublicRunCase) });
  }),
);

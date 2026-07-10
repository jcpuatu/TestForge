import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { prisma } from '../../config/prisma-client';
import { toPublicRunCase } from '../runs/serialize';
import { ForbiddenError } from '../../lib/errors';

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

// Bar of active-run test counts per assignee (Phase K's Workload chart) — Admin/Lead only,
// since unlike /tests (self-scoped by default) this is inherently cross-user data. Matches
// TestRail's own Workload chart living on the Todo tab, a lead/manager-facing view.
meRouter.get(
  '/workload',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'LEAD') {
      throw new ForbiddenError('Only admins and leads can view workload across users');
    }

    const grouped = await prisma.runCase.groupBy({
      by: ['assignedToId'],
      where: { run: { isCompleted: false }, assignedToId: { not: null } },
      _count: { assignedToId: true },
    });

    const users = await prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.assignedToId as string) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const workload = grouped
      .map((g) => ({
        userId: g.assignedToId as string,
        userName: nameById.get(g.assignedToId as string) ?? 'Unknown',
        count: g._count.assignedToId,
      }))
      .sort((a, b) => b.count - a.count);

    res.json({ workload });
  }),
);

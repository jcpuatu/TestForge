import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { prisma } from '../../config/prisma-client';

// Mounted at /api/v1/projects/:projectId/audit-log
export const auditLogNestedRouter = Router({ mergeParams: true });
auditLogNestedRouter.use(requireAuth);

auditLogNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const entries = await prisma.auditLog.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { id: true, name: true } } },
    });
    res.json({ entries });
  }),
);

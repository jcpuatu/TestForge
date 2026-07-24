import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { prisma } from '../../config/prisma-client';
import { paginationMeta, parsePagination } from '../../lib/pagination';

// Mounted at /api/v1/projects/:projectId/audit-log
export const auditLogNestedRouter = Router({ mergeParams: true });
auditLogNestedRouter.use(requireAuth);

auditLogNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    // Previously a hard `take: 200` with no `skip` — a long-lived active project eventually
    // exceeds 200 logged actions, and everything before that was silently unreachable. Real
    // skip/take now, defaulting to the same 200-per-page size for unchanged default behavior.
    const where = { projectId: req.params.projectId };
    const pagination = parsePagination(req.query as Record<string, unknown>, { defaultPageSize: 200 });
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: { actor: { select: { id: true, name: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ entries, ...paginationMeta(total, pagination) });
  }),
);

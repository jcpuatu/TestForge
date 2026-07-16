import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { BadRequestError } from '../../lib/errors';
import { createSectionSchema, moveSectionSchema, updateSectionSchema } from './schema';
import { collectSectionSubtree, moveSection, nextSectionOrderIndex } from './service';
import { logAudit } from '../../lib/audit';

// Mounted at /api/v1/suites/:suiteId/sections
export const sectionsNestedRouter = Router({ mergeParams: true });
sectionsNestedRouter.use(requireAuth);

sectionsNestedRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const sections = await prisma.section.findMany({
      where: { suiteId: req.params.suiteId },
      orderBy: { orderIndex: 'asc' },
    });
    res.json({ sections });
  }),
);

sectionsNestedRouter.post(
  '/',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = createSectionSchema.parse(req.body);
    const orderIndex = await nextSectionOrderIndex(req.params.suiteId, body.parentId ?? null);
    const section = await prisma.section.create({ data: { ...body, suiteId: req.params.suiteId, orderIndex } });
    res.status(201).json({ section });
  }),
);

// Mounted at /api/v1/sections
export const sectionsRouter = Router();
sectionsRouter.use(requireAuth);

sectionsRouter.patch(
  '/:id',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = updateSectionSchema.parse(req.body);
    const section = await prisma.section.update({ where: { id: req.params.id }, data: body });
    res.json({ section });
  }),
);

sectionsRouter.post(
  '/:id/move',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const section = await prisma.section.findUnique({ where: { id: req.params.id } });
    if (!section) throw new NotFoundError('Section');
    const body = moveSectionSchema.parse(req.body);
    try {
      await moveSection(section.id, body.parentId, body.orderIndex);
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Failed to move section');
    }
    const sections = await prisma.section.findMany({ where: { suiteId: section.suiteId }, orderBy: { orderIndex: 'asc' } });
    res.json({ sections });
  }),
);

// Impact preview for the delete-confirmation UI.
sectionsRouter.get(
  '/:id/delete-impact',
  asyncHandler(async (req, res) => {
    const section = await prisma.section.findUnique({ where: { id: req.params.id } });
    if (!section) throw new NotFoundError('Section');

    const subtreeIds = await collectSectionSubtree(section.id);
    const caseCount = await prisma.testCase.count({ where: { sectionId: { in: subtreeIds }, isDeleted: false } });

    res.json({ caseCount, subsectionCount: subtreeIds.length - 1 });
  }),
);

sectionsRouter.delete(
  '/:id',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const section = await prisma.section.findUnique({ where: { id: req.params.id }, include: { suite: true } });
    if (!section) throw new NotFoundError('Section');

    // Matches real TestRail exactly: deleting a section permanently (hard) deletes every
    // subsection and every test case within them — explicitly irreversible, unlike the
    // single-case soft-delete/restore path. Delete deepest-first so the self-relation's
    // onDelete: Restrict never blocks a parent delete on a still-present child.
    const subtreeIds = await collectSectionSubtree(section.id);
    const deletionOrder = [...subtreeIds].reverse();
    const caseCount = await prisma.testCase.count({ where: { sectionId: { in: subtreeIds }, isDeleted: false } });

    await prisma.testCase.deleteMany({ where: { sectionId: { in: subtreeIds } } });
    for (const id of deletionOrder) {
      await prisma.section.delete({ where: { id } });
    }

    await logAudit({
      projectId: section.suite.projectId,
      actorId: req.user!.id,
      action: 'SECTION_DELETED',
      entityType: 'Section',
      entityId: section.id,
      summary: `Deleted section "${section.name}" (${subtreeIds.length - 1} subsection(s), ${caseCount} case(s))`,
    });

    res.status(204).send();
  }),
);

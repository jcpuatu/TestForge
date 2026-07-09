import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import {
  bulkAddLabelsSchema,
  bulkDeleteCasesSchema,
  bulkRestoreCasesSchema,
  bulkUpdateCasesSchema,
  createCaseSchema,
  updateCaseSchema,
} from './schema';
import { CASE_LABELS_INCLUDE, serializeSteps, toPublicCase } from './serialize';
import { buildSectionNameMap, casesToCsv, parseCasesCsv } from './csv';
import { buildCaseListQuery, buildCaseSort, setCaseLabels } from './service';
import { BadRequestError } from '../../lib/errors';

const WRITE_ROLES = ['ADMIN', 'LEAD', 'TESTER'] as const;

// Mounted at /api/v1/suites/:suiteId/cases — flat, filterable list of all cases in a suite
export const casesBySuiteRouter = Router({ mergeParams: true });
casesBySuiteRouter.use(requireAuth);

casesBySuiteRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { where, orderBy } = buildCaseListQuery(req.params.suiteId, req.query as Record<string, unknown>);
    const cases = await prisma.testCase.findMany({ where, orderBy, include: CASE_LABELS_INCLUDE });
    res.json({ cases: cases.map(toPublicCase) });
  }),
);

casesBySuiteRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const [cases, sections] = await Promise.all([
      prisma.testCase.findMany({ where: { suiteId: req.params.suiteId, isDeleted: false }, orderBy: { orderIndex: 'asc' } }),
      prisma.section.findMany({ where: { suiteId: req.params.suiteId } }),
    ]);
    const csv = casesToCsv(cases, buildSectionNameMap(sections));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cases-${req.params.suiteId}.csv"`);
    res.send(csv);
  }),
);

casesBySuiteRouter.post(
  '/import',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const csvText = req.body?.csv;
    if (typeof csvText !== 'string' || csvText.trim().length === 0) {
      throw new BadRequestError('Request body must be { "csv": "<csv text>" }');
    }

    let rows;
    try {
      rows = parseCasesCsv(csvText);
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Failed to parse CSV');
    }
    if (rows.length === 0) {
      throw new BadRequestError('No data rows found in CSV');
    }

    const suite = await prisma.suite.findUnique({ where: { id: req.params.suiteId } });
    if (!suite) throw new NotFoundError('Suite');

    const existingSections = await prisma.section.findMany({ where: { suiteId: suite.id } });
    const sectionByName = new Map(existingSections.map((s) => [s.name.toLowerCase(), s]));

    let created = 0;
    for (const row of rows) {
      let section = sectionByName.get(row.sectionName.toLowerCase());
      if (!section) {
        section = await prisma.section.create({ data: { suiteId: suite.id, name: row.sectionName } });
        sectionByName.set(row.sectionName.toLowerCase(), section);
      }
      await prisma.testCase.create({
        data: {
          suiteId: suite.id,
          sectionId: section.id,
          title: row.title,
          priority: row.priority,
          type: row.type,
          preconditions: row.preconditions,
          steps: serializeSteps(row.steps),
          expectedResult: row.expectedResult,
          referenceLink: row.referenceLink,
          createdById: req.user!.id,
        },
      });
      created++;
    }

    res.status(201).json({ imported: created });
  }),
);

// Mounted at /api/v1/sections/:sectionId/cases
export const casesBySectionRouter = Router({ mergeParams: true });
casesBySectionRouter.use(requireAuth);

casesBySectionRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { deleted } = req.query;
    const cases = await prisma.testCase.findMany({
      where: { sectionId: req.params.sectionId, isDeleted: deleted === 'true' },
      orderBy: buildCaseSort(req.query as Record<string, unknown>),
      include: CASE_LABELS_INCLUDE,
    });
    res.json({ cases: cases.map(toPublicCase) });
  }),
);

casesBySectionRouter.post(
  '/',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const section = await prisma.section.findUnique({ where: { id: req.params.sectionId } });
    if (!section) throw new NotFoundError('Section');
    const { labelIds, ...body } = createCaseSchema.parse(req.body);
    const testCase = await prisma.testCase.create({
      data: {
        ...body,
        steps: serializeSteps(body.steps),
        suiteId: section.suiteId,
        sectionId: section.id,
        createdById: req.user!.id,
      },
    });
    if (labelIds && labelIds.length > 0) await setCaseLabels(testCase.id, labelIds);
    const withLabels = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id }, include: CASE_LABELS_INCLUDE });
    res.status(201).json({ case: toPublicCase(withLabels) });
  }),
);

// Mounted at /api/v1/cases
export const casesRouter = Router();
casesRouter.use(requireAuth);

// Registered before the /:id routes below — Express matches routes in registration order for
// the same HTTP method, and /:id would otherwise greedily match /bulk-update as id="bulk-update".
casesRouter.patch(
  '/bulk-update',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const { caseIds, ...fields } = bulkUpdateCasesSchema.parse(req.body);
    if (Object.keys(fields).length === 0) throw new BadRequestError('At least one field (priority/type/sectionId) is required');
    const { count } = await prisma.testCase.updateMany({ where: { id: { in: caseIds } }, data: fields });
    res.json({ updated: count });
  }),
);

casesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id }, include: CASE_LABELS_INCLUDE });
    if (!testCase || testCase.isDeleted) throw new NotFoundError('Test case');
    res.json({ case: toPublicCase(testCase) });
  }),
);

casesRouter.patch(
  '/:id',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const { labelIds, ...body } = updateCaseSchema.parse(req.body);
    const testCase = await prisma.testCase.update({
      where: { id: req.params.id },
      data: { ...body, steps: serializeSteps(body.steps) },
    });
    if (labelIds !== undefined) await setCaseLabels(testCase.id, labelIds);
    const withLabels = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id }, include: CASE_LABELS_INCLUDE });
    res.json({ case: toPublicCase(withLabels) });
  }),
);

casesRouter.delete(
  '/:id',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    await prisma.testCase.update({ where: { id: req.params.id }, data: { isDeleted: true } });
    res.status(204).send();
  }),
);

casesRouter.post(
  '/:id/restore',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const testCase = await prisma.testCase.update({ where: { id: req.params.id }, data: { isDeleted: false } });
    res.json({ case: toPublicCase(testCase) });
  }),
);

casesRouter.post(
  '/bulk-restore',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = bulkRestoreCasesSchema.parse(req.body);
    const { count } = await prisma.testCase.updateMany({
      where: { id: { in: body.caseIds }, isDeleted: true },
      data: { isDeleted: false },
    });
    res.json({ restored: count });
  }),
);

casesRouter.post(
  '/bulk-delete',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const body = bulkDeleteCasesSchema.parse(req.body);
    const { count } = await prisma.testCase.updateMany({
      where: { id: { in: body.caseIds }, isDeleted: false },
      data: { isDeleted: true },
    });
    res.json({ deleted: count });
  }),
);

casesRouter.post(
  '/bulk-add-labels',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const body = bulkAddLabelsSchema.parse(req.body);
    // Additive, and intentionally doesn't enforce the 10-label-per-case cap in bulk mode —
    // a case already near the cap could end up slightly over it. Acceptable simplification;
    // the single-case form (CaseForm) still enforces the cap for the common path.
    // SQLite's createMany has no `skipDuplicates` option (Postgres/MySQL only), so existing
    // pairs are filtered out in application code instead of relying on the DB to ignore them.
    const existing = await prisma.testCaseLabel.findMany({
      where: { caseId: { in: body.caseIds }, labelId: { in: body.labelIds } },
      select: { caseId: true, labelId: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.caseId}:${e.labelId}`));
    const toCreate = body.caseIds
      .flatMap((caseId) => body.labelIds.map((labelId) => ({ caseId, labelId })))
      .filter((pair) => !existingKeys.has(`${pair.caseId}:${pair.labelId}`));
    if (toCreate.length > 0) await prisma.testCaseLabel.createMany({ data: toCreate });
    res.json({ updated: body.caseIds.length });
  }),
);

// Separate, explicit action from the soft-delete above — matches real TestRail's split between
// "mark as deleted" (recoverable) and "permanently delete" (immediate, unrecoverable). Only
// reachable on an already soft-deleted case, so it can't be used to skip the recovery window.
casesRouter.delete(
  '/:id/permanent',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
    if (!testCase) throw new NotFoundError('Test case');
    if (!testCase.isDeleted) throw new BadRequestError('Case must be soft-deleted before it can be permanently deleted');
    await prisma.testCase.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

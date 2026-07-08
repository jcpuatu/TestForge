import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/prisma-client';
import { NotFoundError } from '../../lib/errors';
import { createCaseSchema, updateCaseSchema } from './schema';
import { serializeSteps, toPublicCase } from './serialize';
import { buildSectionNameMap, casesToCsv, parseCasesCsv } from './csv';
import { BadRequestError } from '../../lib/errors';

const WRITE_ROLES = ['ADMIN', 'LEAD', 'TESTER'] as const;

// Mounted at /api/v1/suites/:suiteId/cases — flat, filterable list of all cases in a suite
export const casesBySuiteRouter = Router({ mergeParams: true });
casesBySuiteRouter.use(requireAuth);

casesBySuiteRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { sectionId, priority, type } = req.query;
    const cases = await prisma.testCase.findMany({
      where: {
        suiteId: req.params.suiteId,
        isDeleted: false,
        ...(typeof sectionId === 'string' ? { sectionId } : {}),
        ...(typeof priority === 'string' ? { priority } : {}),
        ...(typeof type === 'string' ? { type } : {}),
      },
      orderBy: { orderIndex: 'asc' },
    });
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
    const cases = await prisma.testCase.findMany({
      where: { sectionId: req.params.sectionId, isDeleted: false },
      orderBy: { orderIndex: 'asc' },
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
    const body = createCaseSchema.parse(req.body);
    const testCase = await prisma.testCase.create({
      data: {
        ...body,
        steps: serializeSteps(body.steps),
        suiteId: section.suiteId,
        sectionId: section.id,
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ case: toPublicCase(testCase) });
  }),
);

// Mounted at /api/v1/cases
export const casesRouter = Router();
casesRouter.use(requireAuth);

casesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
    if (!testCase || testCase.isDeleted) throw new NotFoundError('Test case');
    res.json({ case: toPublicCase(testCase) });
  }),
);

casesRouter.patch(
  '/:id',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const body = updateCaseSchema.parse(req.body);
    const testCase = await prisma.testCase.update({
      where: { id: req.params.id },
      data: { ...body, steps: serializeSteps(body.steps) },
    });
    res.json({ case: toPublicCase(testCase) });
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

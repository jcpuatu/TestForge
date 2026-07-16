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
import { CASE_LABELS_INCLUDE, CASE_SHARED_STEPS_INCLUDE, serializeSteps, toPublicCase } from './serialize';
import { buildSectionPathMap, casesToCsv, parseCasesCsv, resolveExportColumns } from './csv';
import { casesToFeatureFile, parseFeatureFile } from './gherkin';
import { buildCaseListQuery, buildCaseSort, nextCaseOrderIndex, setCaseLabels } from './service';
import { nextSectionOrderIndex } from '../sections/service';
import { setCaseSharedSteps } from '../sharedSteps/service';
import { BadRequestError } from '../../lib/errors';
import { logAudit } from '../../lib/audit';
import { dispatchWebhookEvent } from '../../lib/webhook-dispatcher';

const CASE_INCLUDE = { ...CASE_LABELS_INCLUDE, ...CASE_SHARED_STEPS_INCLUDE };

const WRITE_ROLES = ['ADMIN', 'LEAD', 'TESTER'] as const;

// Mounted at /api/v1/suites/:suiteId/cases — flat, filterable list of all cases in a suite
export const casesBySuiteRouter = Router({ mergeParams: true });
casesBySuiteRouter.use(requireAuth);

casesBySuiteRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { where, orderBy } = buildCaseListQuery(req.params.suiteId, req.query as Record<string, unknown>);
    const cases = await prisma.testCase.findMany({ where, orderBy, include: CASE_INCLUDE });
    res.json({ cases: cases.map(toPublicCase) });
  }),
);

casesBySuiteRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const sectionIdsParam = req.query.sectionIds;
    const sectionIds =
      typeof sectionIdsParam === 'string' && sectionIdsParam.length > 0 ? sectionIdsParam.split(',').filter(Boolean) : [];
    const columnsParam = req.query.columns;
    const columns = resolveExportColumns(
      typeof columnsParam === 'string' && columnsParam.length > 0 ? columnsParam.split(',').filter(Boolean) : [],
    );

    const [cases, sections] = await Promise.all([
      prisma.testCase.findMany({
        where: {
          suiteId: req.params.suiteId,
          isDeleted: false,
          ...(sectionIds.length > 0 ? { sectionId: { in: sectionIds } } : {}),
        },
        orderBy: { orderIndex: 'asc' },
      }),
      // Full suite (not just the selected sections) — needed so ancestor names still resolve
      // for the "Sections Hierarchy" column even when a selected case's parent section itself
      // wasn't checked in the picker.
      prisma.section.findMany({ where: { suiteId: req.params.suiteId } }),
    ]);
    const csv = casesToCsv(cases, buildSectionPathMap(sections), columns);
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
    const suiteId = suite.id;

    const existingSections = await prisma.section.findMany({ where: { suiteId } });
    const sectionByKey = new Map(
      existingSections.map((s) => [`${s.parentId ?? 'root'}::${s.name.toLowerCase()}`, s]),
    );
    // Lazily-initialized per-parent counters (keyed the same way as sectionByKey) so a batch of
    // sibling sections auto-created across many CSV rows gets real, sequential orderIndex values
    // instead of everything colliding at the schema default of 0 — one initial MAX query per
    // parent actually touched, then incremented in memory for the rest of the import.
    const sectionOrderCounters = new Map<string, number>();
    async function nextSiblingSectionOrder(suiteId: string, parentId: string | null): Promise<number> {
      const key = parentId ?? 'root';
      if (!sectionOrderCounters.has(key)) {
        sectionOrderCounters.set(key, await nextSectionOrderIndex(suiteId, parentId));
      }
      const next = sectionOrderCounters.get(key)!;
      sectionOrderCounters.set(key, next + 1);
      return next;
    }
    // Same lazy-counter shape, scoped per section instead of per section-parent — a section that
    // receives many rows across this same import must not have every one of its new cases
    // collide at orderIndex 0 either.
    const caseOrderCounters = new Map<string, number>();
    async function nextSiblingCaseOrder(sectionId: string): Promise<number> {
      if (!caseOrderCounters.has(sectionId)) {
        caseOrderCounters.set(sectionId, await nextCaseOrderIndex(sectionId));
      }
      const next = caseOrderCounters.get(sectionId)!;
      caseOrderCounters.set(sectionId, next + 1);
      return next;
    }

    // Walks a Sections Hierarchy path (`Parent > Child > Grandchild`) level by level, creating
    // any section that doesn't already exist under its resolved parent — matching-by-name is
    // scoped per parent (via the key's parentId prefix) so two different parents can each have
    // a child section with the same name without colliding.
    async function resolveSectionPath(path: string[]) {
      let parentId: string | null = null;
      let section = null;
      for (const name of path) {
        const key = `${parentId ?? 'root'}::${name.toLowerCase()}`;
        section = sectionByKey.get(key);
        if (!section) {
          const orderIndex = await nextSiblingSectionOrder(suiteId, parentId);
          section = await prisma.section.create({ data: { suiteId, name, parentId, orderIndex } });
          sectionByKey.set(key, section);
        }
        parentId = section.id;
      }
      return section!;
    }

    let created = 0;
    for (const row of rows) {
      const section = await resolveSectionPath(row.sectionPath);
      const orderIndex = await nextSiblingCaseOrder(section.id);
      await prisma.testCase.create({
        data: {
          suiteId: suite.id,
          sectionId: section.id,
          title: row.title,
          priority: row.priority,
          type: row.type,
          // A CSV row's `steps` column is the same "step | expected" per-line format the STEPS
          // template edits — labeling it TEXT (the schema default) would only surface the first
          // step's text in the case form and hide the rest, the same class of bug the template
          // column's migration backfill already had to correct once for pre-existing rows.
          template: row.steps && row.steps.length > 0 ? 'STEPS' : 'TEXT',
          preconditions: row.preconditions,
          steps: serializeSteps(row.steps),
          expectedResult: row.expectedResult,
          referenceLink: row.referenceLink,
          createdById: req.user!.id,
          orderIndex,
        },
      });
      created++;
    }

    // One aggregate event per import batch, not one per row — a several-hundred-row CSV firing
    // CASE_CREATED synchronously per case (this app's webhooks dispatch inline, per-request, with
    // up to a 5s timeout each) would make a routine import take an unreasonable amount of time
    // against any slow/unreachable webhook target.
    if (created > 0) await dispatchWebhookEvent(suite.projectId, 'CASE_CREATED', { count: created, suiteId });

    res.status(201).json({ imported: created });
  }),
);

casesBySuiteRouter.get(
  '/export-feature',
  asyncHandler(async (req, res) => {
    const suite = await prisma.suite.findUnique({ where: { id: req.params.suiteId } });
    if (!suite) throw new NotFoundError('Suite');
    const cases = await prisma.testCase.findMany({
      where: { suiteId: req.params.suiteId, isDeleted: false, template: 'BDD' },
      orderBy: { orderIndex: 'asc' },
    });
    const text = casesToFeatureFile(
      suite.name,
      cases.map((c) => ({ title: c.title, bddLines: c.bddLines ? JSON.parse(c.bddLines) : [] })),
    );
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${suite.name}.feature"`);
    res.send(text);
  }),
);

casesBySuiteRouter.post(
  '/import-feature',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const featureText = req.body?.featureText;
    if (typeof featureText !== 'string' || featureText.trim().length === 0) {
      throw new BadRequestError('Request body must be { "featureText": "<.feature file contents>" }');
    }
    const parsed = parseFeatureFile(featureText);
    if (parsed.scenarios.length === 0) {
      throw new BadRequestError('No Scenario blocks found in this .feature file');
    }

    const suite = await prisma.suite.findUnique({ where: { id: req.params.suiteId } });
    if (!suite) throw new NotFoundError('Suite');

    // Same by-name auto-create-section convention as CSV import, keyed off the Feature name
    // since Gherkin scenarios carry no section info of their own.
    let section = await prisma.section.findFirst({
      where: { suiteId: suite.id, name: { equals: parsed.featureName } },
    });
    if (!section) {
      const orderIndex = await nextSectionOrderIndex(suite.id, null);
      section = await prisma.section.create({ data: { suiteId: suite.id, name: parsed.featureName, orderIndex } });
    }

    let nextOrderIndex = await nextCaseOrderIndex(section.id);
    let created = 0;
    for (const scenario of parsed.scenarios) {
      await prisma.testCase.create({
        data: {
          suiteId: suite.id,
          sectionId: section.id,
          title: scenario.name,
          template: 'BDD',
          bddLines: JSON.stringify(scenario.lines),
          createdById: req.user!.id,
          orderIndex: nextOrderIndex++,
        },
      });
      created++;
    }

    // Same one-event-per-batch reasoning as the CSV importer above.
    if (created > 0) await dispatchWebhookEvent(suite.projectId, 'CASE_CREATED', { count: created, suiteId: suite.id });

    res.status(201).json({ imported: created, sectionName: parsed.featureName });
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
      include: CASE_INCLUDE,
    });
    res.json({ cases: cases.map(toPublicCase) });
  }),
);

casesBySectionRouter.post(
  '/',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const section = await prisma.section.findUnique({
      where: { id: req.params.sectionId },
      include: { suite: { select: { projectId: true } } },
    });
    if (!section) throw new NotFoundError('Section');
    const { labelIds, sharedStepSetIds, ...body } = createCaseSchema.parse(req.body);
    const orderIndex = await nextCaseOrderIndex(section.id);
    const testCase = await prisma.testCase.create({
      data: {
        ...body,
        steps: serializeSteps(body.steps),
        bddLines: serializeSteps(body.bddLines),
        suiteId: section.suiteId,
        sectionId: section.id,
        createdById: req.user!.id,
        orderIndex,
      },
    });
    if (labelIds && labelIds.length > 0) await setCaseLabels(testCase.id, labelIds);
    if (sharedStepSetIds && sharedStepSetIds.length > 0) await setCaseSharedSteps(testCase.id, sharedStepSetIds);
    const withLabels = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id }, include: CASE_INCLUDE });
    await dispatchWebhookEvent(section.suite.projectId, 'CASE_CREATED', { caseId: testCase.id, title: testCase.title });
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
    // Cross-suite moves are deliberately unsupported (see root CLAUDE.md's drag-and-drop scope
    // note) — without this check, sectionId could be set to a section in a different suite than
    // the case's own (unchanged) suiteId, since the two are independent columns on TestCase.
    // That produced a genuinely split/orphaned case: counted in its original suite's case list by
    // suiteId, but also showing up when browsing the new suite's section by sectionId.
    if (fields.sectionId) {
      const section = await prisma.section.findUnique({ where: { id: fields.sectionId } });
      if (!section) throw new NotFoundError('Section');
      const mismatched = await prisma.testCase.count({ where: { id: { in: caseIds }, suiteId: { not: section.suiteId } } });
      if (mismatched > 0) throw new BadRequestError('The target section must belong to the same suite as the test case(s) being moved');
    }
    const { count } = await prisma.testCase.updateMany({ where: { id: { in: caseIds } }, data: fields });
    res.json({ updated: count });
  }),
);

casesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id }, include: CASE_INCLUDE });
    if (!testCase || testCase.isDeleted) throw new NotFoundError('Test case');
    res.json({ case: toPublicCase(testCase) });
  }),
);

// "History & Context": every run this case has appeared in, its latest result there, and the
// same defect-rollup aggregation the project-wide Defects tab uses, scoped to just this case.
casesRouter.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id } });
    if (!testCase) throw new NotFoundError('Test case');

    const runCases = await prisma.runCase.findMany({
      where: { caseId: req.params.id },
      include: {
        run: { select: { id: true, name: true, isCompleted: true } },
        results: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });

    const timeline = runCases.map((rc) => ({
      runId: rc.run.id,
      runName: rc.run.name,
      isCompleted: rc.run.isCompleted,
      status: rc.status,
      defects: rc.results[0]?.defects ?? null,
      resultDate: rc.results[0]?.createdAt ?? null,
    }));

    interface DefectEntry {
      id: string;
      count: number;
      openCount: number;
      lastSeenAt: string;
      runs: { runId: string; runName: string }[];
    }
    const byDefect = new Map<string, DefectEntry>();
    for (const rc of runCases) {
      const latest = rc.results[0];
      if (!latest?.defects) continue;
      const ids = latest.defects.split(',').map((s) => s.trim()).filter(Boolean);
      for (const id of ids) {
        const entry = byDefect.get(id) ?? { id, count: 0, openCount: 0, lastSeenAt: latest.createdAt.toISOString(), runs: [] };
        entry.count += 1;
        if (rc.status === 'FAILED' || rc.status === 'BLOCKED') entry.openCount += 1;
        if (latest.createdAt.toISOString() > entry.lastSeenAt) entry.lastSeenAt = latest.createdAt.toISOString();
        entry.runs.push({ runId: rc.run.id, runName: rc.run.name });
        byDefect.set(id, entry);
      }
    }

    res.json({
      case: { id: testCase.id, title: testCase.title },
      timeline,
      defects: [...byDefect.values()].sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1)),
    });
  }),
);

casesRouter.patch(
  '/:id',
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const { labelIds, sharedStepSetIds, ...body } = updateCaseSchema.parse(req.body);
    if (body.sectionId) {
      const existing = await prisma.testCase.findUnique({ where: { id: req.params.id }, select: { suiteId: true } });
      if (!existing) throw new NotFoundError('Test case');
      const section = await prisma.section.findUnique({ where: { id: body.sectionId } });
      if (!section || section.suiteId !== existing.suiteId) {
        throw new BadRequestError('The target section must belong to the same suite as the test case');
      }
    }
    const testCase = await prisma.testCase.update({
      where: { id: req.params.id },
      data: { ...body, steps: serializeSteps(body.steps), bddLines: serializeSteps(body.bddLines) },
    });
    if (labelIds !== undefined) await setCaseLabels(testCase.id, labelIds);
    if (sharedStepSetIds !== undefined) await setCaseSharedSteps(testCase.id, sharedStepSetIds);
    const withLabels = await prisma.testCase.findUniqueOrThrow({ where: { id: testCase.id }, include: CASE_INCLUDE });
    res.json({ case: toPublicCase(withLabels) });
  }),
);

casesRouter.delete(
  '/:id',
  requireRole('ADMIN', 'LEAD'),
  asyncHandler(async (req, res) => {
    const testCase = await prisma.testCase.update({
      where: { id: req.params.id },
      data: { isDeleted: true },
      include: { suite: true },
    });
    await logAudit({
      projectId: testCase.suite.projectId,
      actorId: req.user!.id,
      action: 'CASE_DELETED',
      entityType: 'TestCase',
      entityId: testCase.id,
      summary: `Deleted case "${testCase.title}"`,
    });
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
    // Fetched before the update, since a case-scoped record is needed to log against — this
    // route (unlike single-case delete just above) previously had no logAudit call at all, a
    // real gap given root CLAUDE.md documents "case delete" as a logged action without
    // distinguishing which of the two actual delete code paths honors that.
    const targets = await prisma.testCase.findMany({
      where: { id: { in: body.caseIds }, isDeleted: false },
      select: { id: true, suite: { select: { projectId: true } } },
    });
    const { count } = await prisma.testCase.updateMany({
      where: { id: { in: body.caseIds }, isDeleted: false },
      data: { isDeleted: true },
    });
    // One summary entry per project touched, not one per case — a bulk action spanning hundreds
    // of cases doesn't need hundreds of near-identical log lines to be useful.
    const byProject = new Map<string, { count: number; sampleId: string }>();
    for (const t of targets) {
      const existing = byProject.get(t.suite.projectId);
      byProject.set(t.suite.projectId, { count: (existing?.count ?? 0) + 1, sampleId: existing?.sampleId ?? t.id });
    }
    for (const [projectId, { count: n, sampleId }] of byProject) {
      await logAudit({
        projectId,
        actorId: req.user!.id,
        action: 'CASE_DELETED',
        entityType: 'TestCase',
        entityId: sampleId,
        summary: `Bulk-deleted ${n} case(s)`,
      });
    }
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
    const testCase = await prisma.testCase.findUnique({ where: { id: req.params.id }, include: { suite: true } });
    if (!testCase) throw new NotFoundError('Test case');
    if (!testCase.isDeleted) throw new BadRequestError('Case must be soft-deleted before it can be permanently deleted');
    await prisma.testCase.delete({ where: { id: req.params.id } });
    // The irreversible step deserves this more than the soft-delete does, yet previously had no
    // logAudit call at all — a real gap, not a deliberate omission.
    await logAudit({
      projectId: testCase.suite.projectId,
      actorId: req.user!.id,
      action: 'CASE_PERMANENTLY_DELETED',
      entityType: 'TestCase',
      entityId: testCase.id,
      summary: `Permanently deleted case "${testCase.title}"`,
    });
    res.status(204).send();
  }),
);

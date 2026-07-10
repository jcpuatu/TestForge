import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma-client';
import { parseReferences } from './aggregation';

// ── Cases x Runs matrix ──────────────────────────────────────────────────
// Shared by Defects: Summary for Cases/References and Results: Comparison for
// Cases/References/Property Distribution (Phase I) — one row per TestCase, one column per
// selected TestRun.

export interface MatrixCell {
  runId: string;
  status: string;
  defects: string[];
}

export interface MatrixRow {
  caseId: string;
  title: string;
  priority: string;
  referenceLink: string | null;
  cells: Map<string, MatrixCell>;
}

interface RawCell {
  caseId: string | null;
  runId: string;
  status: string;
  titleSnapshot: string;
  priority: string;
  case: { referenceLink: string | null } | null;
  results?: { defects: string | null }[];
}

function pivot(raw: RawCell[]): MatrixRow[] {
  const rows = new Map<string, MatrixRow>();
  for (const rc of raw) {
    if (!rc.caseId) continue;
    let row = rows.get(rc.caseId);
    if (!row) {
      row = { caseId: rc.caseId, title: rc.titleSnapshot, priority: rc.priority, referenceLink: rc.case?.referenceLink ?? null, cells: new Map() };
      rows.set(rc.caseId, row);
    }
    row.cells.set(rc.runId, { runId: rc.runId, status: rc.status, defects: rc.results ? parseReferences(rc.results[0]?.defects) : [] });
  }
  return [...rows.values()];
}

function matrixWhere(runIds: string[], sectionIds: string[]): Prisma.RunCaseWhereInput {
  return {
    runId: { in: runIds },
    caseId: { not: null },
    ...(sectionIds.length > 0 ? { case: { sectionId: { in: sectionIds } } } : {}),
  };
}

// Status-only matrix — no Result join, used by report variants that don't need cell-level
// defect/comment detail (Results: Comparison for Cases/References, Property Distribution).
export async function buildCasesRunsMatrix(runIds: string[], sectionIds: string[] = []): Promise<MatrixRow[]> {
  const raw = await prisma.runCase.findMany({
    where: matrixWhere(runIds, sectionIds),
    select: { caseId: true, runId: true, status: true, titleSnapshot: true, priority: true, case: { select: { referenceLink: true } } },
  });
  return pivot(raw);
}

// Same matrix, with each cell's latest Result.defects also fetched — used by Defects: Summary
// for Cases/References, which need to show which defects were logged per case-per-run.
export async function buildCasesRunsMatrixWithDefects(runIds: string[], sectionIds: string[] = []): Promise<MatrixRow[]> {
  const raw = await prisma.runCase.findMany({
    where: matrixWhere(runIds, sectionIds),
    select: {
      caseId: true,
      runId: true,
      status: true,
      titleSnapshot: true,
      priority: true,
      case: { select: { referenceLink: true } },
      results: { orderBy: { createdAt: 'desc' }, take: 1, select: { defects: true } },
    },
  });
  return pivot(raw);
}

// ── Defect aggregation ───────────────────────────────────────────────────
// Generalizes reports/routes.ts's original defectsRouter `byDefect` Map logic so it's usable
// for any run-cases selection, not just "every run in the project."

export async function fetchLatestResultPerRunCase(where: Prisma.RunCaseWhereInput) {
  return prisma.runCase.findMany({
    where,
    select: {
      caseId: true,
      titleSnapshot: true,
      status: true,
      run: { select: { id: true, name: true } },
      results: { orderBy: { createdAt: 'desc' }, take: 1, select: { defects: true, createdAt: true } },
    },
  });
}

export interface DefectEntry {
  id: string;
  count: number;
  openCount: number;
  resolvedCount: number;
  lastSeenAt: string;
  cases: { caseId: string | null; caseTitle: string; runId: string; runName: string; status: string }[];
}

export function aggregateDefects(runCases: Awaited<ReturnType<typeof fetchLatestResultPerRunCase>>): DefectEntry[] {
  const byDefect = new Map<string, DefectEntry>();

  for (const rc of runCases) {
    const latest = rc.results[0];
    if (!latest?.defects) continue;
    const ids = parseReferences(latest.defects);

    for (const id of ids) {
      const entry = byDefect.get(id) ?? {
        id,
        count: 0,
        openCount: 0,
        resolvedCount: 0,
        lastSeenAt: latest.createdAt.toISOString(),
        cases: [],
      };
      entry.count += 1;
      if (rc.status === 'FAILED' || rc.status === 'BLOCKED') entry.openCount += 1;
      if (rc.status === 'PASSED') entry.resolvedCount += 1;
      if (latest.createdAt.toISOString() > entry.lastSeenAt) entry.lastSeenAt = latest.createdAt.toISOString();
      entry.cases.push({ caseId: rc.caseId, caseTitle: rc.titleSnapshot, runId: rc.run.id, runName: rc.run.name, status: rc.status });
      byDefect.set(id, entry);
    }
  }

  return [...byDefect.values()].sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
}

// Resolves a report's run-scope query params into an actual run-id list: explicit runIds if
// given, else the N most recent runs in the project (same "no selection = recent" convention
// as casesReports.ts's getStatusTops).
export async function resolveRunIds(projectId: string, runIds: string[], take = 25): Promise<{ id: string; name: string; isCompleted: boolean }[]> {
  if (runIds.length > 0) {
    return prisma.testRun.findMany({ where: { id: { in: runIds }, projectId }, select: { id: true, name: true, isCompleted: true } });
  }
  return prisma.testRun.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, take, select: { id: true, name: true, isCompleted: true } });
}

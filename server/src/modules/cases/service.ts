import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma-client';
import { BadRequestError } from '../../lib/errors';

// Replace-all semantics: pass the full desired label set, not a delta. Called from both
// case create and case update — `labelIds: undefined` means "don't touch labels" (the caller
// simply omits the key), so this is only invoked when the field was actually present.
export async function setCaseLabels(caseId: string, labelIds: string[]) {
  await prisma.$transaction([
    prisma.testCaseLabel.deleteMany({ where: { caseId } }),
    ...(labelIds.length > 0
      ? [prisma.testCaseLabel.createMany({ data: labelIds.map((labelId) => ({ caseId, labelId })) })]
      : []),
  ]);
}

// Same reasoning as sections/service.ts's nextSectionOrderIndex — createCaseSchema exposes no
// orderIndex field and no create route ever computed one, so every fresh case silently defaulted
// to the schema's orderIndex 0. MAX+1 (not a sibling COUNT) so this stays correct after
// deletions have left gaps.
export async function nextCaseOrderIndex(sectionId: string): Promise<number> {
  const result = await prisma.testCase.aggregate({ where: { sectionId }, _max: { orderIndex: true } });
  return (result._max.orderIndex ?? -1) + 1;
}

const SORTABLE_FIELDS = ['title', 'priority', 'type', 'createdAt', 'orderIndex'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

function splitCsv(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value.split(',').filter(Boolean);
}

function parseDateFilterParam(value: unknown, paramName: string): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestError(`${paramName} is not a valid date`);
  return date;
}

export function buildCaseSort(query: Record<string, unknown>): Prisma.TestCaseOrderByWithRelationInput {
  const sortByRaw = typeof query.sortBy === 'string' ? query.sortBy : 'orderIndex';
  const sortBy: SortableField = (SORTABLE_FIELDS as readonly string[]).includes(sortByRaw)
    ? (sortByRaw as SortableField)
    : 'orderIndex';
  const sortDir = query.sortDir === 'desc' ? 'desc' : 'asc';
  return { [sortBy]: sortDir };
}

// Builds the Prisma where/orderBy for the suite-wide filterable case list. Mirrors TestRail's
// case filter dialog: multiple values within one category (Priority, Type, Section, Created By)
// combine with OR; the `match` param controls how the categories combine with each other —
// "all" (AND across categories, the default) or "any" (every selected value across every
// category flattened into one big OR), matching TestRail's "Match all/any of the above" toggle.
export function buildCaseListQuery(
  suiteId: string,
  query: Record<string, unknown>,
): { where: Prisma.TestCaseWhereInput; orderBy: Prisma.TestCaseOrderByWithRelationInput } {
  const sectionIds = splitCsv(query.sectionIds);
  const priorities = splitCsv(query.priorities);
  const types = splitCsv(query.types);
  const createdByIds = splitCsv(query.createdByIds);
  const labelIds = splitCsv(query.labelIds);
  // An invalid date string (typo'd query param, malformed client code) previously flowed
  // straight into Prisma's where clause as a JS `Invalid Date` object — Prisma's serialization of
  // that throws, and the throw isn't an AppError/ZodError, so it surfaced as a raw 500 instead of
  // a clear validation error.
  const createdAfter = parseDateFilterParam(query.createdAfter, 'createdAfter');
  const createdBefore = parseDateFilterParam(query.createdBefore, 'createdBefore');
  const matchAny = query.match === 'any';

  const categoryClauses: Prisma.TestCaseWhereInput[] = [];
  if (sectionIds.length > 0) categoryClauses.push({ sectionId: { in: sectionIds } });
  if (priorities.length > 0) categoryClauses.push({ priority: { in: priorities } });
  if (types.length > 0) categoryClauses.push({ type: { in: types } });
  if (createdByIds.length > 0) categoryClauses.push({ createdById: { in: createdByIds } });
  if (labelIds.length > 0) categoryClauses.push({ labels: { some: { labelId: { in: labelIds } } } });
  if (createdAfter || createdBefore) {
    categoryClauses.push({
      createdAt: {
        ...(createdAfter ? { gte: createdAfter } : {}),
        ...(createdBefore ? { lte: createdBefore } : {}),
      },
    });
  }

  const base: Prisma.TestCaseWhereInput = {
    suiteId,
    isDeleted: query.deleted === 'true',
  };

  if (categoryClauses.length > 0) {
    base[matchAny ? 'OR' : 'AND'] = categoryClauses;
  }

  return { where: base, orderBy: buildCaseSort(query) };
}

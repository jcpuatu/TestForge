import type { Prisma } from '@prisma/client';

const SORTABLE_FIELDS = ['title', 'priority', 'type', 'createdAt', 'orderIndex'] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

function splitCsv(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value.split(',').filter(Boolean);
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
  const createdAfter = typeof query.createdAfter === 'string' ? new Date(query.createdAfter) : null;
  const createdBefore = typeof query.createdBefore === 'string' ? new Date(query.createdBefore) : null;
  const matchAny = query.match === 'any';

  const categoryClauses: Prisma.TestCaseWhereInput[] = [];
  if (sectionIds.length > 0) categoryClauses.push({ sectionId: { in: sectionIds } });
  if (priorities.length > 0) categoryClauses.push({ priority: { in: priorities } });
  if (types.length > 0) categoryClauses.push({ type: { in: types } });
  if (createdByIds.length > 0) categoryClauses.push({ createdById: { in: createdByIds } });
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

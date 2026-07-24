import type { Section, TestCase } from '@prisma/client';
import { toCsv, parseCsv } from '../../lib/csv';
import { stepsToLines, linesToSteps } from './stepsFormat';

export const CASE_COLUMNS = [
  'section',
  'title',
  'priority',
  'type',
  'preconditions',
  'steps',
  'expectedResult',
  'referenceLink',
] as const;
export type CaseColumn = (typeof CASE_COLUMNS)[number];

const COLUMN_HEADER: Record<CaseColumn, string> = {
  section: 'Sections Hierarchy',
  title: 'title',
  priority: 'priority',
  type: 'type',
  preconditions: 'preconditions',
  steps: 'steps',
  expectedResult: 'expectedResult',
  referenceLink: 'referenceLink',
};

const COLUMN_VALUE: Record<CaseColumn, (c: TestCase, sectionPathById: Map<string, string>) => string> = {
  section: (c, sectionPathById) => (c.sectionId ? (sectionPathById.get(c.sectionId) ?? '') : ''),
  title: (c) => c.title,
  priority: (c) => c.priority,
  type: (c) => c.type,
  preconditions: (c) => c.preconditions ?? '',
  steps: (c) => stepsToLines(c.steps),
  expectedResult: (c) => c.expectedResult ?? '',
  referenceLink: (c) => c.referenceLink ?? '',
};

// `title` is always included regardless of the caller's picker selection — a case with no
// title column has nothing to identify it by on re-import.
export function resolveExportColumns(requested: string[]): CaseColumn[] {
  const valid = requested.filter((c): c is CaseColumn => (CASE_COLUMNS as readonly string[]).includes(c));
  const cols = valid.length > 0 ? valid : [...CASE_COLUMNS];
  if (!cols.includes('title')) cols.unshift('title');
  return cols;
}

export function casesToCsv(
  cases: TestCase[],
  sectionPathById: Map<string, string>,
  columns: CaseColumn[] = [...CASE_COLUMNS],
): string {
  const rows = [
    columns.map((c) => COLUMN_HEADER[c]),
    ...cases.map((c) => columns.map((col) => COLUMN_VALUE[col](c, sectionPathById))),
  ];
  return toCsv(rows);
}

export interface ParsedCaseRow {
  sectionPath: string[];
  title: string;
  priority: string;
  type: string;
  preconditions?: string;
  steps?: { step: string; expected?: string }[];
  expectedResult?: string;
  referenceLink?: string;
}

const VALID_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const VALID_TYPES = new Set([
  'FUNCTIONAL',
  'SMOKE',
  'REGRESSION',
  'PERFORMANCE',
  'SECURITY',
  'USABILITY',
  'ACCEPTANCE',
  'OTHER',
]);

// A "Sections Hierarchy" cell (`Parent > Child > Grandchild`) auto-creates nested subsections
// on import, matching real TestRail's own distinction between a flat "Sections" column (name
// only) and "Sections Hierarchy" (a `>`-delimited full path) — both header names are accepted
// on read and parsed identically, since a plain name with no `>` is just a one-segment path.
function parseSectionPath(raw: string): string[] {
  const parts = raw
    .split('>')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ['Imported'];
}

export function parseCasesCsv(csvText: string): ParsedCaseRow[] {
  // A leading UTF-8 BOM (common from Excel/Notepad saves, and some AI-generated files) isn't
  // stripped by String.trim() — left in place it silently glues onto the first header cell
  // (a U+FEFF-prefixed "section"), which then fails to match `col('section')` and dumps every
  // row into a single fallback "Imported" section instead of respecting the file's actual
  // hierarchy. The escape sequence below (not a raw BOM character) avoids an invisible,
  // lint-flagged character sitting directly in the source.
  const rows = parseCsv(csvText.replace(/^\uFEFF/, '').trim());
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const col = (name: string) => header.indexOf(name);
  const idx = {
    section: col('sectionshierarchy') >= 0 ? col('sectionshierarchy') : col('section'),
    title: col('title'),
    priority: col('priority'),
    type: col('type'),
    preconditions: col('preconditions'),
    steps: col('steps'),
    expectedResult: col('expectedresult'),
    referenceLink: col('referencelink'),
  };
  if (idx.title === -1) {
    throw new Error('CSV must include a "title" column');
  }

  // The rest of the app validates every case field through createCaseSchema (non-empty title,
  // length caps) — this importer built its rows directly from raw cell text with none of that,
  // so a blank title cell (or a short/malformed row whose columns shift, landing `undefined` on
  // title) silently created a titleless case instead of failing the way the same input would via
  // the JSON API. Validated once here, at the single choke point every import row passes through.
  return rows.slice(1).map((row, i) => {
    const rowNum = i + 2; // 1-indexed, +1 to account for the header row
    const priority = (idx.priority >= 0 ? row[idx.priority] : '').toUpperCase() || 'MEDIUM';
    const type = (idx.type >= 0 ? row[idx.type] : '').toUpperCase() || 'FUNCTIONAL';
    const title = (row[idx.title] ?? '').trim();
    if (!title) throw new Error(`Row ${rowNum}: title is required`);
    if (title.length > 300) throw new Error(`Row ${rowNum}: title must be 300 characters or fewer`);
    const preconditions = idx.preconditions >= 0 ? row[idx.preconditions] || undefined : undefined;
    const expectedResult = idx.expectedResult >= 0 ? row[idx.expectedResult] || undefined : undefined;
    const referenceLink = idx.referenceLink >= 0 ? row[idx.referenceLink] || undefined : undefined;
    if (preconditions && preconditions.length > 4000) throw new Error(`Row ${rowNum}: preconditions must be 4000 characters or fewer`);
    if (expectedResult && expectedResult.length > 4000) throw new Error(`Row ${rowNum}: expectedResult must be 4000 characters or fewer`);
    if (referenceLink && referenceLink.length > 500) throw new Error(`Row ${rowNum}: referenceLink must be 500 characters or fewer`);
    return {
      sectionPath: parseSectionPath(idx.section >= 0 ? row[idx.section] : ''),
      title,
      priority: VALID_PRIORITIES.has(priority) ? priority : 'MEDIUM',
      type: VALID_TYPES.has(type) ? type : 'FUNCTIONAL',
      preconditions,
      steps: idx.steps >= 0 ? linesToSteps(row[idx.steps]) : undefined,
      expectedResult,
      referenceLink,
    };
  });
}

// Full ancestor path (`Parent > Child`) for every section, keyed by id — used by CSV export so
// re-importing the file recreates the same nesting via `parseSectionPath` above.
export function buildSectionPathMap(sections: Section[]): Map<string, string> {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const cache = new Map<string, string>();
  function pathFor(id: string): string {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const section = byId.get(id);
    if (!section) return '';
    const path = section.parentId ? `${pathFor(section.parentId)} > ${section.name}` : section.name;
    cache.set(id, path);
    return path;
  }
  for (const s of sections) pathFor(s.id);
  return cache;
}

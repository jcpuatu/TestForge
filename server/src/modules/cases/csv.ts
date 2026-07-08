import type { Section, TestCase } from '@prisma/client';
import { toCsv, parseCsv } from '../../lib/csv';
import { stepsToLines, linesToSteps } from './stepsFormat';

const HEADER = ['section', 'title', 'priority', 'type', 'preconditions', 'steps', 'expectedResult', 'referenceLink'];

export function casesToCsv(cases: TestCase[], sectionNameById: Map<string, string>): string {
  const rows = [
    HEADER,
    ...cases.map((c) => [
      c.sectionId ? (sectionNameById.get(c.sectionId) ?? '') : '',
      c.title,
      c.priority,
      c.type,
      c.preconditions ?? '',
      stepsToLines(c.steps),
      c.expectedResult ?? '',
      c.referenceLink ?? '',
    ]),
  ];
  return toCsv(rows);
}

export interface ParsedCaseRow {
  sectionName: string;
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

export function parseCasesCsv(csvText: string): ParsedCaseRow[] {
  const rows = parseCsv(csvText.trim());
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    section: col('section'),
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

  return rows.slice(1).map((row) => {
    const priority = (idx.priority >= 0 ? row[idx.priority] : '').toUpperCase() || 'MEDIUM';
    const type = (idx.type >= 0 ? row[idx.type] : '').toUpperCase() || 'FUNCTIONAL';
    return {
      sectionName: (idx.section >= 0 ? row[idx.section] : '').trim() || 'Imported',
      title: row[idx.title],
      priority: VALID_PRIORITIES.has(priority) ? priority : 'MEDIUM',
      type: VALID_TYPES.has(type) ? type : 'FUNCTIONAL',
      preconditions: idx.preconditions >= 0 ? row[idx.preconditions] || undefined : undefined,
      steps: idx.steps >= 0 ? linesToSteps(row[idx.steps]) : undefined,
      expectedResult: idx.expectedResult >= 0 ? row[idx.expectedResult] || undefined : undefined,
      referenceLink: idx.referenceLink >= 0 ? row[idx.referenceLink] || undefined : undefined,
    };
  });
}

export function buildSectionNameMap(sections: Section[]): Map<string, string> {
  return new Map(sections.map((s) => [s.id, s.name]));
}

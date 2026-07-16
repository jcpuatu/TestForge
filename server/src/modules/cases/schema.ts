import { z } from 'zod';

const stepSchema = z.object({
  step: z.string(),
  expected: z.string().optional(),
});

const bddLineSchema = z.object({
  keyword: z.enum(['Given', 'When', 'Then', 'And', 'But']),
  text: z.string(),
});

export const createCaseSchema = z.object({
  title: z.string().min(1).max(300),
  template: z.enum(['TEXT', 'STEPS', 'EXPLORATORY', 'BDD']).default('TEXT'),
  preconditions: z.string().max(4000).optional(),
  steps: z.array(stepSchema).optional(),
  expectedResult: z.string().max(4000).optional(),
  mission: z.string().max(2000).optional(),
  goals: z.string().max(2000).optional(),
  bddLines: z.array(bddLineSchema).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  type: z
    .enum(['FUNCTIONAL', 'SMOKE', 'REGRESSION', 'PERFORMANCE', 'SECURITY', 'USABILITY', 'ACCEPTANCE', 'OTHER'])
    .default('FUNCTIONAL'),
  estimate: z.string().max(50).optional(),
  referenceLink: z.string().max(500).optional(),
  labelIds: z.array(z.string()).max(10).optional(),
  sharedStepSetIds: z.array(z.string()).max(20).optional(),
});

export const updateCaseSchema = createCaseSchema.partial().extend({
  sectionId: z.string().nullable().optional(),
});

// Every caseIds/testIds cap in this app was 500 — an arbitrary demo-scale limit a real suite
// (e.g. a 500+ case CSV import, then "select all") routinely exceeds. Raised to 5000 here and
// in results/schema.ts's bulkAssignSchema/bulkResultSchema.
export const bulkRestoreCasesSchema = z.object({
  caseIds: z.array(z.string()).min(1).max(5000),
});

export const bulkDeleteCasesSchema = z.object({
  caseIds: z.array(z.string()).min(1).max(5000),
});

// Only priority/type/sectionId are bulk-editable — free-text fields (title, steps, etc.) don't
// make sense to overwrite identically across many cases at once.
export const bulkUpdateCasesSchema = z.object({
  caseIds: z.array(z.string()).min(1).max(5000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  type: z
    .enum(['FUNCTIONAL', 'SMOKE', 'REGRESSION', 'PERFORMANCE', 'SECURITY', 'USABILITY', 'ACCEPTANCE', 'OTHER'])
    .optional(),
  sectionId: z.string().optional(),
});

// Additive (not replace-all) — matches TestRail's own bulk-label behavior: applying labels to
// many cases at once adds to whatever each case already has, it doesn't overwrite it.
export const bulkAddLabelsSchema = z.object({
  // 500 was an arbitrary demo-scale cap that a real suite (e.g. a 500+ case CSV import)
  // routinely exceeds on a plain "select all" — raised to a real ceiling, not a realistic ceiling.
  caseIds: z.array(z.string()).min(1).max(5000),
  labelIds: z.array(z.string()).min(1).max(10),
});

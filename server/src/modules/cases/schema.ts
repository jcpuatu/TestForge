import { z } from 'zod';

const stepSchema = z.object({
  step: z.string(),
  expected: z.string().optional(),
});

export const createCaseSchema = z.object({
  title: z.string().min(1).max(300),
  template: z.enum(['TEXT', 'STEPS', 'EXPLORATORY', 'BDD']).default('TEXT'),
  preconditions: z.string().max(4000).optional(),
  steps: z.array(stepSchema).optional(),
  expectedResult: z.string().max(4000).optional(),
  mission: z.string().max(2000).optional(),
  goals: z.string().max(2000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  type: z
    .enum(['FUNCTIONAL', 'SMOKE', 'REGRESSION', 'PERFORMANCE', 'SECURITY', 'USABILITY', 'ACCEPTANCE', 'OTHER'])
    .default('FUNCTIONAL'),
  estimate: z.string().max(50).optional(),
  referenceLink: z.string().max(500).optional(),
  labelIds: z.array(z.string()).max(10).optional(),
});

export const updateCaseSchema = createCaseSchema.partial().extend({
  sectionId: z.string().nullable().optional(),
});

export const bulkRestoreCasesSchema = z.object({
  caseIds: z.array(z.string()).min(1).max(500),
});

export const bulkDeleteCasesSchema = z.object({
  caseIds: z.array(z.string()).min(1).max(500),
});

// Only priority/type/sectionId are bulk-editable — free-text fields (title, steps, etc.) don't
// make sense to overwrite identically across many cases at once.
export const bulkUpdateCasesSchema = z.object({
  caseIds: z.array(z.string()).min(1).max(500),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  type: z
    .enum(['FUNCTIONAL', 'SMOKE', 'REGRESSION', 'PERFORMANCE', 'SECURITY', 'USABILITY', 'ACCEPTANCE', 'OTHER'])
    .optional(),
  sectionId: z.string().optional(),
});

// Additive (not replace-all) — matches TestRail's own bulk-label behavior: applying labels to
// many cases at once adds to whatever each case already has, it doesn't overwrite it.
export const bulkAddLabelsSchema = z.object({
  caseIds: z.array(z.string()).min(1).max(500),
  labelIds: z.array(z.string()).min(1).max(10),
});

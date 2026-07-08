import { z } from 'zod';

const stepSchema = z.object({
  step: z.string(),
  expected: z.string().optional(),
});

export const createCaseSchema = z.object({
  title: z.string().min(1).max(300),
  preconditions: z.string().max(4000).optional(),
  steps: z.array(stepSchema).optional(),
  expectedResult: z.string().max(4000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  type: z
    .enum(['FUNCTIONAL', 'SMOKE', 'REGRESSION', 'PERFORMANCE', 'SECURITY', 'USABILITY', 'ACCEPTANCE', 'OTHER'])
    .default('FUNCTIONAL'),
  estimate: z.string().max(50).optional(),
  referenceLink: z.string().max(500).optional(),
});

export const updateCaseSchema = createCaseSchema.partial().extend({
  sectionId: z.string().nullable().optional(),
});

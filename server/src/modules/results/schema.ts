import { z } from 'zod';

const stepResultSchema = z.object({
  status: z.enum(['PASSED', 'FAILED', 'BLOCKED', 'RETEST', 'UNTESTED']),
  actual: z.string().max(2000).optional(),
});

export const createResultSchema = z.object({
  status: z.enum(['PASSED', 'FAILED', 'BLOCKED', 'RETEST', 'UNTESTED']),
  comment: z.string().max(4000).optional(),
  defects: z.string().max(500).optional(),
  elapsedMs: z.number().int().nonnegative().optional(),
  // Positionally matches RunCase.stepsSnapshot — only meaningful for STEPS-template tests, but
  // not enforced server-side (an EXPLORATORY/BDD test just never sends this from the client).
  stepResults: z.array(stepResultSchema).optional(),
});

export const reassignSchema = z.object({
  assignedToId: z.string().nullable(),
});

export const bulkAssignSchema = z.object({
  testIds: z.array(z.string()).min(1).max(500),
  assignedToId: z.string().nullable(),
});

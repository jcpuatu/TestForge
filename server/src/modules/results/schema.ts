import { z } from 'zod';

const stepResultSchema = z.object({
  status: z.enum(['PASSED', 'FAILED', 'BLOCKED', 'RETEST', 'UNTESTED']),
  actual: z.string().max(2000).optional(),
});

export const createResultSchema = z.object({
  status: z.enum(['PASSED', 'FAILED', 'BLOCKED', 'RETEST', 'UNTESTED']),
  comment: z.string().max(4000).optional(),
  defects: z.string().max(500).optional(),
  version: z.string().max(100).optional(),
  // 24h ceiling — generous for any real single-test execution/exploratory session, and well
  // under Prisma Int's 32-bit ceiling (2,147,483,647), which an unbounded value could exceed and
  // crash with an unhandled Prisma error instead of a clean validation message.
  elapsedMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000).optional(),
  // Positionally matches RunCase.stepsSnapshot — only meaningful for STEPS-template tests, but
  // not enforced server-side (an EXPLORATORY/BDD test just never sends this from the client).
  stepResults: z.array(stepResultSchema).optional(),
});

export const reassignSchema = z.object({
  assignedToId: z.string().nullable(),
});

export const bulkAssignSchema = z.object({
  testIds: z.array(z.string()).min(1).max(5000),
  assignedToId: z.string().nullable(),
});

// One status for every selected test at once — no stepResults (that's only meaningful entering
// results one test at a time) and no defects (a defect ID rarely applies identically across
// many different tests).
export const bulkResultSchema = z.object({
  testIds: z.array(z.string()).min(1).max(5000),
  status: z.enum(['PASSED', 'FAILED', 'BLOCKED', 'RETEST', 'UNTESTED']),
  comment: z.string().max(4000).optional(),
});

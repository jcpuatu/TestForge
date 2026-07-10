import { z } from 'zod';

export const createRunSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  suiteId: z.string(),
  planId: z.string().optional(),
  milestoneId: z.string().optional(),
  configLabel: z.string().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  caseIds: z.array(z.string()).optional(), // omit to include all cases in the suite
  assignedToId: z.string().optional(), // assigns every test in the run to this user at creation
});

export const rerunSchema = z.object({
  statuses: z.array(z.enum(['UNTESTED', 'PASSED', 'FAILED', 'BLOCKED', 'RETEST'])).min(1),
  copyAssignees: z.boolean().default(false),
  name: z.string().min(1).max(200).optional(),
});

export const updateRunSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  // Not a TestRun column — when present, bulk-reassigns every RunCase in the run in one step.
  // Distinct from the existing per-test /tests/:id/results-adjacent reassign and the
  // /runs/:id/tests/bulk-assign endpoint, which target a chosen subset instead of "everything".
  assignedToId: z.string().nullable().optional(),
});

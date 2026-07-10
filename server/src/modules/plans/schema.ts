import { z } from 'zod';

export const createPlanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  milestoneId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  referenceId: z.string().max(200).optional(),
});

export const rerunPlanSchema = z.object({
  statuses: z.array(z.enum(['UNTESTED', 'PASSED', 'FAILED', 'BLOCKED', 'RETEST'])).min(1),
  copyAssignees: z.boolean().default(false),
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  milestoneId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  referenceId: z.string().max(200).optional(),
  isCompleted: z.boolean().optional(),
});

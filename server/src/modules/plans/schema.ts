import { z } from 'zod';

export const createPlanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  milestoneId: z.string().optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  milestoneId: z.string().nullable().optional(),
  isCompleted: z.boolean().optional(),
});

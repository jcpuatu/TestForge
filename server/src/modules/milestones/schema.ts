import { z } from 'zod';

export const createMilestoneSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  references: z.string().max(500).optional(),
  parentId: z.string().optional(),
});

export const updateMilestoneSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  references: z.string().max(500).optional(),
  isCompleted: z.boolean().optional(),
});

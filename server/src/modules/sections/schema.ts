import { z } from 'zod';

export const createSectionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  parentId: z.string().optional(),
});

export const updateSectionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  orderIndex: z.number().int().optional(),
});

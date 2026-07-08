import { z } from 'zod';

export const createWebhookSchema = z.object({
  url: z.string().url(),
  event: z.enum(['RUN_COMPLETED', 'RUN_CREATED', 'CASE_CREATED']).default('RUN_COMPLETED'),
});

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  event: z.enum(['RUN_COMPLETED', 'RUN_CREATED', 'CASE_CREATED']).optional(),
  isActive: z.boolean().optional(),
});

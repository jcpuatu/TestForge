import { z } from 'zod';

const stepSchema = z.object({
  step: z.string(),
  expected: z.string().optional(),
});

export const createSharedStepSetSchema = z.object({
  name: z.string().min(1).max(120),
  steps: z.array(stepSchema).min(1),
});

export const updateSharedStepSetSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  steps: z.array(stepSchema).min(1).optional(),
});

export const promoteSharedStepsSchema = z.object({
  name: z.string().min(1).max(120),
});

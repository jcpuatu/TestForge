import { z } from 'zod';

export const createConfigGroupSchema = z.object({
  name: z.string().min(1).max(100),
  configs: z.array(z.string().min(1).max(100)).optional(), // seed initial values in the same call
});

export const updateConfigGroupSchema = z.object({
  name: z.string().min(1).max(100),
});

export const createConfigSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateConfigSchema = z.object({
  name: z.string().min(1).max(100),
});

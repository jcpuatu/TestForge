import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createApiKeySchema = z.object({
  label: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

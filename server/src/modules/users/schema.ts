import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'LEAD', 'TESTER', 'VIEWER']).default('TESTER'),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(['ADMIN', 'LEAD', 'TESTER', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const createApiKeySchema = z.object({
  label: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

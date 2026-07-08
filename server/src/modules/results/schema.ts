import { z } from 'zod';

export const createResultSchema = z.object({
  status: z.enum(['PASSED', 'FAILED', 'BLOCKED', 'RETEST', 'UNTESTED']),
  comment: z.string().max(4000).optional(),
  defects: z.string().max(500).optional(),
  elapsedMs: z.number().int().nonnegative().optional(),
});

export const reassignSchema = z.object({
  assignedToId: z.string().nullable(),
});

import { z } from 'zod';

// Matches TestRail's own label constraints: 1-20 chars, case-insensitive uniqueness handled
// at the query layer (SQLite collation), letters/numbers/spaces/most punctuation allowed.
const labelName = z.string().min(1).max(20);

export const createLabelSchema = z.object({
  name: labelName,
});

export const updateLabelSchema = z.object({
  name: labelName,
});

// Up to 10 labels per case, matching TestRail's own cap.
export const assignLabelsSchema = z.object({
  labelIds: z.array(z.string()).max(10),
});

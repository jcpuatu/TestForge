import { prisma } from '../config/prisma-client';
import { NotFoundError } from './errors';

// Shared by every route that accepts an assignedToId (single reassign, bulk-assign, run-level
// bulk-reassign-all, assign-all-at-creation) — none of them validated the id referenced a real
// user before this, so a bad id (a typo, a stale id, anything malformed) fell straight through to
// an unhandled Prisma foreign-key error instead of a clean 404.
export async function assertUserExists(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new NotFoundError('User');
}

import { prisma } from '../../config/prisma-client';

// Prisma has no recursive-CTE helper, so descendants are collected via iterative
// level-by-level BFS instead. Returns ids ordered shallowest-first (root last-in on
// each level); callers that need to delete sections without tripping the self-relation's
// onDelete: Restrict should delete in reverse (deepest-first).
export async function collectSectionSubtree(rootId: string): Promise<string[]> {
  const all: string[] = [rootId];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await prisma.section.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    if (children.length === 0) break;
    frontier = children.map((c) => c.id);
    all.push(...frontier);
  }

  return all;
}

// Moves a section to a new parent (or keeps its current one) at a specific position among its
// new siblings, then re-normalizes every sibling's orderIndex to 0..n-1 in one transaction —
// avoids the gap/drift that repeated moves would otherwise cause if positions were computed
// from stale index math instead of a fresh re-sort each time.
export async function moveSection(sectionId: string, newParentId: string | null, targetIndex: number) {
  const section = await prisma.section.findUniqueOrThrow({ where: { id: sectionId } });
  const originalParentId = section.parentId;

  if (newParentId) {
    if (newParentId === sectionId) throw new Error('A section cannot be moved into itself');
    const subtreeIds = await collectSectionSubtree(sectionId);
    if (subtreeIds.includes(newParentId)) throw new Error('A section cannot be moved into its own subsection');
  }

  const siblings = await prisma.section.findMany({
    where: { suiteId: section.suiteId, parentId: newParentId, id: { not: sectionId } },
    orderBy: { orderIndex: 'asc' },
  });

  const reordered = [...siblings];
  reordered.splice(Math.min(targetIndex, reordered.length), 0, section);

  const updates = reordered.map((s, index) =>
    prisma.section.update({
      where: { id: s.id },
      data: { orderIndex: index, ...(s.id === sectionId ? { parentId: newParentId } : {}) },
    }),
  );

  // A reparent (as opposed to a same-parent reorder) leaves a gap in the ORIGIN parent's
  // remaining children where the moved section used to sit — e.g. [0,1,2,3,4] minus index 2
  // becomes [0,1,_,3,4], never renormalized back down to [0,1,2,3]. Left alone, repeated
  // reparents compound into arbitrarily large gaps at the origin. Re-sort and renumber those
  // remaining siblings too, in the same transaction, whenever a move actually changes parents.
  if (originalParentId !== newParentId) {
    const originSiblings = await prisma.section.findMany({
      where: { suiteId: section.suiteId, parentId: originalParentId, id: { not: sectionId } },
      orderBy: { orderIndex: 'asc' },
    });
    updates.push(
      ...originSiblings.map((s, index) => prisma.section.update({ where: { id: s.id }, data: { orderIndex: index } })),
    );
  }

  await prisma.$transaction(updates);
}

// New siblings must not all collide at the schema default of 0 — a real, reproduced bug: neither
// createSectionSchema nor its route ever computed a real orderIndex, so every fresh sibling
// silently fell back to the Prisma schema default of 0. "Creation order" only ever looked
// correct because of SQLite's incidental (not guaranteed) tie-break behavior on ties, not
// because it was actually being set. MAX+1 (not a sibling COUNT) so this stays correct even
// after deletions have left gaps in the existing sequence.
export async function nextSectionOrderIndex(suiteId: string, parentId: string | null): Promise<number> {
  const result = await prisma.section.aggregate({ where: { suiteId, parentId }, _max: { orderIndex: true } });
  return (result._max.orderIndex ?? -1) + 1;
}

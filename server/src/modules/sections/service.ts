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

  await prisma.$transaction(
    reordered.map((s, index) =>
      prisma.section.update({
        where: { id: s.id },
        data: { orderIndex: index, ...(s.id === sectionId ? { parentId: newParentId } : {}) },
      }),
    ),
  );
}

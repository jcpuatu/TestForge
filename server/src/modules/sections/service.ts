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

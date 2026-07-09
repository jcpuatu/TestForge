import type { RunCase, Result } from '@prisma/client';

export function toPublicRunCase(runCase: RunCase & { results?: Result[] }) {
  const { results, ...rest } = runCase;
  const latest = results?.[0];
  return {
    ...rest,
    stepsSnapshot: rest.stepsSnapshot ? JSON.parse(rest.stepsSnapshot) : null,
    bddLinesSnapshot: rest.bddLinesSnapshot ? JSON.parse(rest.bddLinesSnapshot) : null,
    latestDefects: latest?.defects ?? null,
    latestComment: latest?.comment ?? null,
  };
}

import type { RunCase } from '@prisma/client';

export function toPublicRunCase(runCase: RunCase) {
  return {
    ...runCase,
    stepsSnapshot: runCase.stepsSnapshot ? JSON.parse(runCase.stepsSnapshot) : null,
  };
}

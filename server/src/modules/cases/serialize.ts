import type { TestCase } from '@prisma/client';

export function serializeSteps(steps: unknown): string | undefined {
  return steps === undefined ? undefined : JSON.stringify(steps);
}

export function toPublicCase(testCase: TestCase) {
  return {
    ...testCase,
    steps: testCase.steps ? JSON.parse(testCase.steps) : null,
  };
}

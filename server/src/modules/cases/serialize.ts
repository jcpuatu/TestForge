import type { Label, TestCase, TestCaseLabel } from '@prisma/client';

export function serializeSteps(steps: unknown): string | undefined {
  return steps === undefined ? undefined : JSON.stringify(steps);
}

type CaseWithLabels = TestCase & { labels?: (TestCaseLabel & { label: Label })[] };

export function toPublicCase(testCase: CaseWithLabels) {
  const { labels, ...rest } = testCase;
  return {
    ...rest,
    steps: testCase.steps ? JSON.parse(testCase.steps) : null,
    labels: labels ? labels.map((l) => l.label) : [],
  };
}

export const CASE_LABELS_INCLUDE = { labels: { include: { label: true } } } as const;

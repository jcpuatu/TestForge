import type { Label, SharedStepSet, TestCase, TestCaseLabel, TestCaseSharedSteps } from '@prisma/client';

export function serializeSteps(steps: unknown): string | undefined {
  return steps === undefined ? undefined : JSON.stringify(steps);
}

type CaseWithLabels = TestCase & {
  labels?: (TestCaseLabel & { label: Label })[];
  sharedStepLinks?: (TestCaseSharedSteps & { sharedStepSet: SharedStepSet })[];
};

export function toPublicCase(testCase: CaseWithLabels) {
  const { labels, sharedStepLinks, ...rest } = testCase;
  return {
    ...rest,
    steps: testCase.steps ? JSON.parse(testCase.steps) : null,
    bddLines: testCase.bddLines ? JSON.parse(testCase.bddLines) : null,
    labels: labels ? labels.map((l) => l.label) : [],
    // Resolved (not merged into `steps`) so the client can render each block under its own
    // "Shared: <name>" heading — live-linked, always reflects the set's *current* content.
    sharedSteps: sharedStepLinks
      ? sharedStepLinks.map((l) => ({ id: l.sharedStepSet.id, name: l.sharedStepSet.name, steps: JSON.parse(l.sharedStepSet.steps) }))
      : [],
  };
}

export const CASE_LABELS_INCLUDE = { labels: { include: { label: true } } } as const;
export const CASE_SHARED_STEPS_INCLUDE = {
  sharedStepLinks: { include: { sharedStepSet: true }, orderBy: { orderIndex: 'asc' } },
} as const;

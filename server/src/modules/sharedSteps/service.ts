import { prisma } from '../../config/prisma-client';
import type { TestCase } from '@prisma/client';

type StepEntry = { step: string; expected?: string };

// Replace-all, mirroring setCaseLabels in cases/service.ts — deletes then recreates the join
// rows in one transaction rather than diffing. Order of `sharedStepSetIds` becomes orderIndex,
// so shared-step blocks always render/resolve in the order the case author attached them.
export async function setCaseSharedSteps(caseId: string, sharedStepSetIds: string[]) {
  await prisma.$transaction([
    prisma.testCaseSharedSteps.deleteMany({ where: { caseId } }),
    ...(sharedStepSetIds.length > 0
      ? [
          prisma.testCaseSharedSteps.createMany({
            data: sharedStepSetIds.map((sharedStepSetId, orderIndex) => ({ caseId, sharedStepSetId, orderIndex })),
          }),
        ]
      : []),
  ]);
}

// Additive — appends one more set after whatever the case already has attached, instead of
// replacing the whole attachment list. Used by the "promote steps to shared set" action, which
// must not silently detach any set the case was already using; setCaseSharedSteps's replace-all
// semantics are correct for CaseForm's own checkbox list (which always submits its full current
// selection) but were wrong here, since the promote endpoint only ever knows about the ONE newly
// created set, not the case's pre-existing attachments.
export async function addCaseSharedStep(caseId: string, sharedStepSetId: string) {
  const existing = await prisma.testCaseSharedSteps.findMany({
    where: { caseId },
    orderBy: { orderIndex: 'asc' },
    select: { sharedStepSetId: true },
  });
  await setCaseSharedSteps(caseId, [...existing.map((e) => e.sharedStepSetId), sharedStepSetId]);
}

// Resolves each case's own literal `steps` plus every attached SharedStepSet's steps
// (in attachment order), flattened into one array — used only at run-creation time, where the
// snapshot must be fully self-contained and immune to later edits to the case or its shared
// sets. Batches the join-table lookup for all cases in one query rather than N+1.
export async function resolveStepsForCases(cases: TestCase[]): Promise<Map<string, StepEntry[]>> {
  const links = await prisma.testCaseSharedSteps.findMany({
    where: { caseId: { in: cases.map((c) => c.id) } },
    include: { sharedStepSet: true },
    orderBy: { orderIndex: 'asc' },
  });
  const linksByCase = new Map<string, typeof links>();
  for (const link of links) {
    const list = linksByCase.get(link.caseId) ?? [];
    list.push(link);
    linksByCase.set(link.caseId, list);
  }

  const result = new Map<string, StepEntry[]>();
  for (const c of cases) {
    const own: StepEntry[] = c.steps ? JSON.parse(c.steps) : [];
    const shared = (linksByCase.get(c.id) ?? []).flatMap((link): StepEntry[] =>
      JSON.parse(link.sharedStepSet.steps),
    );
    result.set(c.id, [...own, ...shared]);
  }
  return result;
}

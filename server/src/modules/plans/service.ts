import { prisma } from '../../config/prisma-client';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import { rerunRun } from '../runs/service';

// Reruns every run in the plan (each independently, same status filter for all) and attaches
// the resulting new runs back onto this same plan — simpler than real TestRail's option to
// spin up a whole new plan, a deliberate scope reduction for a portfolio-scale tool. A run with
// no tests matching the selected statuses is skipped rather than failing the whole batch; the
// caller gets back both what succeeded and how many were skipped so it can report accurately.
//
// Each run's rerun is independent — this loop is deliberately NOT one all-or-nothing outer
// transaction (rerunRun already wraps its own run+runCases creation in its own transaction).
// Previously, any error OTHER than the expected "no matching tests" BadRequestError re-threw and
// aborted the whole loop — runs already reran in earlier iterations stayed committed, but the
// caller never learned they existed, and the ones after the failure silently never ran at all.
// Catching broadly here and returning a `failed` list instead means a genuinely unexpected error
// on one run can't hide the fact that N other runs did succeed, or that M more never got a
// chance to.
export async function rerunPlan(
  planId: string,
  options: { statuses: string[]; copyAssignees: boolean },
  createdById: string,
) {
  const plan = await prisma.testPlan.findUnique({ where: { id: planId }, include: { runs: true } });
  if (!plan) throw new NotFoundError('Plan');
  if (plan.runs.length === 0) throw new BadRequestError('This plan has no runs to rerun');

  const newRuns = [];
  const failed: { runId: string; runName: string; message: string }[] = [];
  let skipped = 0;
  for (const run of plan.runs) {
    try {
      const newRun = await rerunRun(run.id, { ...options, name: `${run.name} (Rerun)` }, createdById);
      newRuns.push(newRun);
    } catch (err) {
      if (err instanceof BadRequestError) {
        skipped++;
        continue;
      }
      failed.push({ runId: run.id, runName: run.name, message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }
  if (newRuns.length === 0) {
    if (failed.length > 0) {
      throw new BadRequestError(`Rerun failed for all ${failed.length} eligible run(s): ${failed.map((f) => f.runName).join(', ')}`);
    }
    throw new BadRequestError('No tests in any run in this plan match the selected statuses');
  }

  return { runs: newRuns, skipped, failed };
}

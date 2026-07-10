import { prisma } from '../../config/prisma-client';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import { rerunRun } from '../runs/service';

// Reruns every run in the plan (each independently, same status filter for all) and attaches
// the resulting new runs back onto this same plan — simpler than real TestRail's option to
// spin up a whole new plan, a deliberate scope reduction for a portfolio-scale tool. A run with
// no tests matching the selected statuses is skipped rather than failing the whole batch; the
// caller gets back both what succeeded and how many were skipped so it can report accurately.
export async function rerunPlan(
  planId: string,
  options: { statuses: string[]; copyAssignees: boolean },
  createdById: string,
) {
  const plan = await prisma.testPlan.findUnique({ where: { id: planId }, include: { runs: true } });
  if (!plan) throw new NotFoundError('Plan');
  if (plan.runs.length === 0) throw new BadRequestError('This plan has no runs to rerun');

  const newRuns = [];
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
      throw err;
    }
  }
  if (newRuns.length === 0) {
    throw new BadRequestError('No tests in any run in this plan match the selected statuses');
  }

  return { runs: newRuns, skipped };
}

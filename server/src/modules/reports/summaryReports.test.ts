import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'summary-reports-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
});

async function seed() {
  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Summary Reports ${Date.now()}-${Math.random()}` });
  const projectId = project.body.project.id as string;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
  const suiteId = suite.body.suite.id as string;
  const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Section' });
  await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Case A' });

  const milestone = await request(app).post(`/api/v1/projects/${projectId}/milestones`).set(auth()).send({ name: 'M1' });
  const milestoneId = milestone.body.milestone.id as string;
  const plan = await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth()).send({ name: 'P1', milestoneId });
  const planId = plan.body.plan.id as string;

  // One run tied directly to the milestone, one tied only via a plan that's tied to the
  // milestone (TestRun.milestoneId isn't inherited through a plan at creation time), and one
  // fully unscoped run — this exercises the milestone-scope OR-union resolution.
  const runDirect = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: 'Run Direct', suiteId, milestoneId });
  const runViaPlan = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: 'Run Via Plan', suiteId, planId });
  const runUnscoped = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: 'Run Unscoped', suiteId });

  const directTests = (await request(app).get(`/api/v1/runs/${runDirect.body.run.id}/tests`).set(auth())).body.tests;
  await request(app).post(`/api/v1/tests/${directTests[0].id}/results`).set(auth()).send({ status: 'PASSED' });

  const viaPlanTests = (await request(app).get(`/api/v1/runs/${runViaPlan.body.run.id}/tests`).set(auth())).body.tests;
  await request(app).post(`/api/v1/tests/${viaPlanTests[0].id}/results`).set(auth()).send({ status: 'FAILED' });

  return {
    projectId,
    milestoneId,
    planId,
    runDirectId: runDirect.body.run.id as string,
    runViaPlanId: runViaPlan.body.run.id as string,
    runUnscopedId: runUnscoped.body.run.id as string,
  };
}

describe('Summary Reports', () => {
  it('Milestone scope includes both direct runs and runs reachable only via a tied plan', async () => {
    const { milestoneId, runDirectId, runViaPlanId, runUnscopedId } = await seed();
    const res = await request(app).get(`/api/v1/milestones/${milestoneId}/reports/summary`).set(auth());
    expect(res.status).toBe(200);
    const runIds = res.body.runs.map((r: { id: string }) => r.id);
    expect(runIds).toEqual(expect.arrayContaining([runDirectId, runViaPlanId]));
    expect(runIds).not.toContain(runUnscopedId);
    expect(res.body.total).toBe(2);
    expect(res.body.statusCounts.PASSED).toBe(1);
    expect(res.body.statusCounts.FAILED).toBe(1);
  });

  // Regression test for a real bug of the same shape as the already-fixed Project-scope one:
  // Milestone.parentId is a real, shipped hierarchy (MilestonesTab renders it as an indented
  // tree), so a run attached to a CHILD milestone — the natural way to use the hierarchy — was
  // previously invisible to the PARENT milestone's Summary report, which only checked its own id.
  it('Milestone scope includes runs attached to a child milestone, not just its own id', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Summary Nesting ${Date.now()}-${Math.random()}` });
    const projectId = project.body.project.id as string;
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
    const suiteId = suite.body.suite.id as string;
    const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Section' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Case A' });

    const parent = await request(app).post(`/api/v1/projects/${projectId}/milestones`).set(auth()).send({ name: 'Release' });
    const parentId = parent.body.milestone.id as string;
    const child = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth())
      .send({ name: 'Sprint 1', parentId });
    const childId = child.body.milestone.id as string;

    const run = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth())
      .send({ name: 'Sprint Run', suiteId, milestoneId: childId });
    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth());
    await request(app).post(`/api/v1/tests/${tests.body.tests[0].id}/results`).set(auth()).send({ status: 'PASSED' });

    const parentReport = await request(app).get(`/api/v1/milestones/${parentId}/reports/summary`).set(auth());
    expect(parentReport.status).toBe(200);
    expect(parentReport.body.runs.map((r: { id: string }) => r.id)).toContain(run.body.run.id);
    expect(parentReport.body.total).toBe(1);

    const childReport = await request(app).get(`/api/v1/milestones/${childId}/reports/summary`).set(auth());
    expect(childReport.body.runs.map((r: { id: string }) => r.id)).toContain(run.body.run.id);
  });

  it('Plan scope includes only that plan\'s own runs', async () => {
    const { planId, runViaPlanId, runDirectId } = await seed();
    const res = await request(app).get(`/api/v1/plans/${planId}/reports/summary`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.runs.map((r: { id: string }) => r.id)).toEqual([runViaPlanId]);
    expect(res.body.runs.map((r: { id: string }) => r.id)).not.toContain(runDirectId);
  });

  it('Project scope includes every run in the project, including runs with no milestone at all', async () => {
    // Regression test for a real user-reported bug: the original implementation resolved
    // "project scope" by looping the project's milestones and aggregating only their runs, so a
    // run created without a milestone — the ordinary case, not an edge case — never appeared in
    // its own Project Summary even after being closed with real results ("i already closed a
    // run but it is empty"). TestRun.projectId is direct; scope should just be "every run here."
    const { projectId, runDirectId, runViaPlanId, runUnscopedId } = await seed();
    const res = await request(app).get(`/api/v1/projects/${projectId}/reports/summary`).set(auth());
    expect(res.status).toBe(200);
    const runIds = res.body.runs.map((r: { id: string }) => r.id);
    expect(runIds).toEqual(expect.arrayContaining([runDirectId, runViaPlanId, runUnscopedId]));
    expect(res.body.total).toBe(3);
  });

  it('Runs scope uses only the explicitly-provided run ids, including otherwise-unscoped runs', async () => {
    const { projectId, runUnscopedId } = await seed();
    const res = await request(app).get(`/api/v1/projects/${projectId}/reports/runs-summary?runIds=${runUnscopedId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.runs.map((r: { id: string }) => r.id)).toEqual([runUnscopedId]);
  });

  it('Runs scope with no runIds returns an empty report, not a default recent-runs list', async () => {
    const { projectId } = await seed();
    const res = await request(app).get(`/api/v1/projects/${projectId}/reports/runs-summary`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.runs).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.passRate).toBeNull();
  });

  it('computes percentComplete/remainingCount from UNTESTED status', async () => {
    const { milestoneId } = await seed();
    const res = await request(app).get(`/api/v1/milestones/${milestoneId}/reports/summary`).set(auth());
    expect(res.body.progress.remainingCount).toBe(0);
    expect(res.body.progress.percentComplete).toBe(1);
  });

  // Regression test: "remaining" previously only counted UNTESTED, so a run that's 100% BLOCKED
  // or 100% RETEST showed "100% Complete, 0 Remaining" — directly contradicting the
  // StackedStatusBar on the same screen (which correctly shows 100% of the other color), and
  // contradicting this app's own Rerun feature's definition of "still needs another pass"
  // (FAILED/BLOCKED/RETEST). BLOCKED/RETEST tests haven't actually been validated; they should
  // count as remaining work, same as UNTESTED.
  it('treats BLOCKED and RETEST as remaining work, not complete', async () => {
    const { projectId } = await seed();
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Blocked Suite' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth()).send({ name: 'S' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Blocked Case' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Retest Case' });
    const run = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth())
      .send({ name: 'All Blocked/Retest', suiteId: suite.body.suite.id });
    const runTests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth());
    await request(app).post(`/api/v1/tests/${runTests.body.tests[0].id}/results`).set(auth()).send({ status: 'BLOCKED' });
    await request(app).post(`/api/v1/tests/${runTests.body.tests[1].id}/results`).set(auth()).send({ status: 'RETEST' });

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/reports/runs-summary?runIds=${run.body.run.id}`)
      .set(auth());
    expect(res.body.total).toBe(2);
    expect(res.body.progress.remainingCount).toBe(2);
    expect(res.body.progress.percentComplete).toBe(0);
  });

  it('the /reports/summary and /reports/runs-summary project routes do not collide', async () => {
    const { projectId } = await seed();
    const summary = await request(app).get(`/api/v1/projects/${projectId}/reports/summary`).set(auth());
    const runsSummary = await request(app).get(`/api/v1/projects/${projectId}/reports/runs-summary`).set(auth());
    expect(summary.status).toBe(200);
    expect(runsSummary.status).toBe(200);
    // Distinguishable by scope: project-summary picks up the milestone-tied runs, runs-summary
    // (no runIds passed) is empty -- if the routes were colliding these would be identical.
    expect(summary.body.runs.length).toBeGreaterThan(0);
    expect(runsSummary.body.runs).toEqual([]);
  });
});

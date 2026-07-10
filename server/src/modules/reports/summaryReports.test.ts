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

  it('Plan scope includes only that plan\'s own runs', async () => {
    const { planId, runViaPlanId, runDirectId } = await seed();
    const res = await request(app).get(`/api/v1/plans/${planId}/reports/summary`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.runs.map((r: { id: string }) => r.id)).toEqual([runViaPlanId]);
    expect(res.body.runs.map((r: { id: string }) => r.id)).not.toContain(runDirectId);
  });

  it('Project scope aggregates every milestone\'s runs, excluding fully unscoped runs', async () => {
    const { projectId, runDirectId, runViaPlanId, runUnscopedId } = await seed();
    const res = await request(app).get(`/api/v1/projects/${projectId}/reports/summary`).set(auth());
    expect(res.status).toBe(200);
    const runIds = res.body.runs.map((r: { id: string }) => r.id);
    expect(runIds).toEqual(expect.arrayContaining([runDirectId, runViaPlanId]));
    expect(runIds).not.toContain(runUnscopedId);
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

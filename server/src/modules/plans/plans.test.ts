import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let projectId: string;
let suiteId: string;

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'plan-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = login.body.accessToken;

  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'Plan Project' });
  projectId = project.body.project.id;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
  suiteId = suite.body.suite.id;
  const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Section' });
  await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Case' });
});

describe('plans', () => {
  it('creates a plan and attaches a run to it', async () => {
    const plan = await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth()).send({ name: 'Regression Plan' });
    expect(plan.status).toBe(201);
    const planId = plan.body.plan.id;

    const run = await request(app).post(`/api/v1/plans/${planId}/runs`).set(auth()).send({ name: 'Run under plan', suiteId });
    expect(run.status).toBe(201);
    expect(run.body.run.planId).toBe(planId);

    const detail = await request(app).get(`/api/v1/plans/${planId}`).set(auth());
    expect(detail.body.plan.runs).toHaveLength(1);
    expect(detail.body.plan.runs[0].name).toBe('Run under plan');
  });

  it('renames a plan, and deleting it unlinks (does not delete) its runs', async () => {
    const plan = await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth()).send({ name: 'Old Plan Name' });
    const planId = plan.body.plan.id;

    const renamed = await request(app).patch(`/api/v1/plans/${planId}`).set(auth()).send({ name: 'New Plan Name' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.plan.name).toBe('New Plan Name');

    const run = await request(app).post(`/api/v1/plans/${planId}/runs`).set(auth()).send({ name: 'Run in plan', suiteId });
    const runId = run.body.run.id;

    const del = await request(app).delete(`/api/v1/plans/${planId}`).set(auth());
    expect(del.status).toBe(204);

    const dbRun = await prisma.testRun.findUnique({ where: { id: runId } });
    expect(dbRun).not.toBeNull();
    expect(dbRun?.planId).toBeNull();
  });

  it('accepts start/end dates and a referenceId, and rejects date changes once completed', async () => {
    const plan = await request(app)
      .post(`/api/v1/projects/${projectId}/plans`)
      .set(auth())
      .send({ name: 'Dated Plan', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-15T00:00:00.000Z', referenceId: 'PROJ-42' });
    expect(plan.status).toBe(201);
    expect(plan.body.plan.referenceId).toBe('PROJ-42');
    const planId = plan.body.plan.id;

    await request(app).patch(`/api/v1/plans/${planId}`).set(auth()).send({ isCompleted: true });
    const blocked = await request(app).patch(`/api/v1/plans/${planId}`).set(auth()).send({ endDate: '2026-02-01T00:00:00.000Z' });
    expect(blocked.status).toBe(400);
  });

  it('reruns every run in a plan, skipping ones with no matching tests, and attaches new runs to the same plan', async () => {
    const plan = await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth()).send({ name: 'Plan To Rerun' });
    const planId = plan.body.plan.id;

    const runA = await request(app).post(`/api/v1/plans/${planId}/runs`).set(auth()).send({ name: 'Run A', suiteId });
    const runB = await request(app).post(`/api/v1/plans/${planId}/runs`).set(auth()).send({ name: 'Run B', suiteId });
    const testsA = await request(app).get(`/api/v1/runs/${runA.body.run.id}/tests`).set(auth());
    await request(app).post(`/api/v1/tests/${testsA.body.tests[0].id}/results`).set(auth()).send({ status: 'FAILED' });
    // Run B is left fully UNTESTED, so it has nothing matching FAILED — should be skipped, not error the batch.

    const rerun = await request(app).post(`/api/v1/plans/${planId}/rerun`).set(auth()).send({ statuses: ['FAILED'] });
    expect(rerun.status).toBe(201);
    expect(rerun.body.runs).toHaveLength(1);
    expect(rerun.body.skipped).toBe(1);
    void runB;

    const detail = await request(app).get(`/api/v1/plans/${planId}`).set(auth());
    expect(detail.body.plan.runs.map((r: { name: string }) => r.name).sort()).toEqual(['Run A', 'Run A (Rerun)', 'Run B']);
  });

  // Regression test: rerunning the same source run twice previously produced two runs literally
  // named identically ("Smoke (Rerun)" and "Smoke (Rerun)"), distinguishable only by id.
  it('disambiguates a rerun name that collides with an existing run in the suite', async () => {
    const plan = await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth()).send({ name: 'Plan Rerun Twice' });
    const planId = plan.body.plan.id;
    const run = await request(app).post(`/api/v1/plans/${planId}/runs`).set(auth()).send({ name: 'Repeatable Run', suiteId });
    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth());
    await request(app).post(`/api/v1/tests/${tests.body.tests[0].id}/results`).set(auth()).send({ status: 'FAILED' });

    const first = await request(app).post(`/api/v1/runs/${run.body.run.id}/rerun`).set(auth()).send({ statuses: ['FAILED'] });
    const second = await request(app).post(`/api/v1/runs/${run.body.run.id}/rerun`).set(auth()).send({ statuses: ['FAILED'] });
    expect(first.body.run.name).toBe('Repeatable Run (Rerun)');
    expect(second.body.run.name).toBe('Repeatable Run (Rerun) (2)');
  });

  // Regression test: milestoneId was accepted with zero check that it belonged to the same
  // project — a plan could be pointed at a completely unrelated project's milestone, live-leaking
  // that milestone's name/dates into this plan's own Date Inheritance display.
  it('rejects a milestoneId that belongs to a different project, on both create and update', async () => {
    const otherProject = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Other Project ${Date.now()}` });
    const foreignMilestone = await request(app)
      .post(`/api/v1/projects/${otherProject.body.project.id}/milestones`)
      .set(auth())
      .send({ name: 'Foreign Milestone' });

    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/plans`)
      .set(auth())
      .send({ name: 'Plan With Foreign Milestone', milestoneId: foreignMilestone.body.milestone.id });
    expect(created.status).toBe(404);

    const plan = await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth()).send({ name: 'Plan For Update Test' });
    const updated = await request(app)
      .patch(`/api/v1/plans/${plan.body.plan.id}`)
      .set(auth())
      .send({ milestoneId: foreignMilestone.body.milestone.id });
    expect(updated.status).toBe(404);
  });
});

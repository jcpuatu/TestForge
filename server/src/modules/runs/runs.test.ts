import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'run-admin@example.com', name: 'Run Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = login.body.accessToken;
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedSuiteWithCases() {
  const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Run Project' });
  const projectId = project.body.project.id;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite' });
  const suiteId = suite.body.suite.id;
  const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth(adminToken)).send({ name: 'Section' });
  const sectionId = section.body.section.id;
  await request(app).post(`/api/v1/sections/${sectionId}/cases`).set(auth(adminToken)).send({ title: 'Case A', priority: 'HIGH' });
  await request(app).post(`/api/v1/sections/${sectionId}/cases`).set(auth(adminToken)).send({ title: 'Case B', priority: 'LOW' });
  return { projectId, suiteId };
}

describe('runs and results', () => {
  it('snapshots all non-deleted cases in the suite when created', async () => {
    const { projectId, suiteId } = await seedSuiteWithCases();
    const run = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Full Run', suiteId });
    expect(run.status).toBe(201);

    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth(adminToken));
    expect(tests.body.tests).toHaveLength(2);
    expect(tests.body.tests.map((t: { titleSnapshot: string }) => t.titleSnapshot).sort()).toEqual(['Case A', 'Case B']);
    expect(tests.body.tests.every((t: { status: string }) => t.status === 'UNTESTED')).toBe(true);
  });

  it('snapshots template/mission/goals for an exploratory case', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Expl Run Project' });
    const projectId = project.body.project.id;
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite' });
    const suiteId = suite.body.suite.id;
    const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth(adminToken)).send({ name: 'Section' });
    await request(app)
      .post(`/api/v1/sections/${section.body.section.id}/cases`)
      .set(auth(adminToken))
      .send({ title: 'Explore checkout', template: 'EXPLORATORY', mission: 'Find gaps', goals: 'Try weird inputs' });

    const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth(adminToken)).send({ name: 'Expl Run', suiteId });
    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth(adminToken));
    expect(tests.body.tests[0].templateSnapshot).toBe('EXPLORATORY');
    expect(tests.body.tests[0].missionSnapshot).toBe('Find gaps');
    expect(tests.body.tests[0].goalsSnapshot).toBe('Try weird inputs');
  });

  it('accepts start/end dates on creation and rejects date changes once completed', async () => {
    const { projectId, suiteId } = await seedSuiteWithCases();
    const run = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Dated Run', suiteId, startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-10T00:00:00.000Z' });
    expect(run.status).toBe(201);
    const runId = run.body.run.id;

    const fetched = await request(app).get(`/api/v1/runs/${runId}`).set(auth(adminToken));
    expect(fetched.body.run.startDate).not.toBeNull();
    expect(fetched.body.run.endDate).not.toBeNull();

    await request(app).post(`/api/v1/runs/${runId}/close`).set(auth(adminToken));
    const blocked = await request(app).patch(`/api/v1/runs/${runId}`).set(auth(adminToken)).send({ endDate: '2026-02-01T00:00:00.000Z' });
    expect(blocked.status).toBe(400);
  });

  it('reruns only the tests matching the selected statuses, cloning their snapshots not live case content', async () => {
    const { projectId, suiteId } = await seedSuiteWithCases();
    const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth(adminToken)).send({ name: 'Original Run', suiteId });
    const runId = run.body.run.id;
    const tests = await request(app).get(`/api/v1/runs/${runId}/tests`).set(auth(adminToken));
    const [testA, testB] = tests.body.tests;

    await request(app).post(`/api/v1/tests/${testA.id}/results`).set(auth(adminToken)).send({ status: 'FAILED' });
    await request(app).post(`/api/v1/tests/${testB.id}/results`).set(auth(adminToken)).send({ status: 'PASSED' });

    // Edit the source case after the run was created — the rerun must NOT pick up this edit.
    await request(app).patch(`/api/v1/cases/${testA.caseId}`).set(auth(adminToken)).send({ title: 'Edited after run' });

    const rerun = await request(app)
      .post(`/api/v1/runs/${runId}/rerun`)
      .set(auth(adminToken))
      .send({ statuses: ['FAILED', 'BLOCKED'] });
    expect(rerun.status).toBe(201);
    expect(rerun.body.run.name).toBe('Original Run (Rerun)');

    const rerunTests = await request(app).get(`/api/v1/runs/${rerun.body.run.id}/tests`).set(auth(adminToken));
    expect(rerunTests.body.tests).toHaveLength(1);
    expect(rerunTests.body.tests[0].titleSnapshot).toBe(testA.titleSnapshot);
    expect(rerunTests.body.tests[0].titleSnapshot).not.toBe('Edited after run');
  });

  it('rejects a rerun when no tests match the selected statuses', async () => {
    const { projectId, suiteId } = await seedSuiteWithCases();
    const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth(adminToken)).send({ name: 'All Untested', suiteId });
    const rerun = await request(app).post(`/api/v1/runs/${run.body.run.id}/rerun`).set(auth(adminToken)).send({ statuses: ['FAILED'] });
    expect(rerun.status).toBe(400);
  });

  it('assigns every test in a run to one user at creation, and bulk-reassigns via PATCH', async () => {
    const { projectId, suiteId } = await seedSuiteWithCases();
    const tester = await prisma.user.create({
      data: { email: 'run-assignee@example.com', name: 'Assignee', role: 'TESTER', passwordHash: await hashPassword('TesterPass123!') },
    });

    const run = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Assigned Run', suiteId, assignedToId: tester.id });
    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth(adminToken));
    expect(tests.body.tests.every((t: { assignedToId: string }) => t.assignedToId === tester.id)).toBe(true);

    const unassign = await request(app).patch(`/api/v1/runs/${run.body.run.id}`).set(auth(adminToken)).send({ assignedToId: null });
    expect(unassign.status).toBe(200);
    const afterUnassign = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth(adminToken));
    expect(afterUnassign.body.tests.every((t: { assignedToId: string | null }) => t.assignedToId === null)).toBe(true);
  });

  it('supports a partial run with only selected case ids', async () => {
    const { projectId, suiteId } = await seedSuiteWithCases();
    const cases = await request(app).get(`/api/v1/suites/${suiteId}/cases`).set(auth(adminToken));
    const oneCaseId = cases.body.cases[0].id;

    const run = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Partial Run', suiteId, caseIds: [oneCaseId] });
    expect(run.status).toBe(201);

    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth(adminToken));
    expect(tests.body.tests).toHaveLength(1);
  });

  it('submitting a result updates the run case status and appears in history, reflected in the summary', async () => {
    const { projectId, suiteId } = await seedSuiteWithCases();
    const run = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Result Run', suiteId });
    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth(adminToken));
    const testId = tests.body.tests[0].id;

    const result = await request(app)
      .post(`/api/v1/tests/${testId}/results`)
      .set(auth(adminToken))
      .send({ status: 'FAILED', comment: 'Broke on step 2', defects: 'BUG-42' });
    expect(result.status).toBe(201);

    const updatedTest = await request(app).get(`/api/v1/tests/${testId}`).set(auth(adminToken));
    expect(updatedTest.body.test.status).toBe('FAILED');

    const history = await request(app).get(`/api/v1/tests/${testId}/results`).set(auth(adminToken));
    expect(history.body.results).toHaveLength(1);
    expect(history.body.results[0].defects).toBe('BUG-42');

    const summary = await request(app).get(`/api/v1/runs/${run.body.run.id}/summary`).set(auth(adminToken));
    expect(summary.body.counts.FAILED).toBe(1);
    expect(summary.body.counts.UNTESTED).toBe(1);
    expect(summary.body.total).toBe(2);
  });

  it('rejects creating a run with no matching cases', async () => {
    const { projectId, suiteId } = await seedSuiteWithCases();
    const run = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Empty Run', suiteId, caseIds: ['nonexistent-id'] });
    expect(run.status).toBe(400);
  });

  it('closing a run marks it completed', async () => {
    const { projectId, suiteId } = await seedSuiteWithCases();
    const run = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Close Me', suiteId });
    const closed = await request(app).post(`/api/v1/runs/${run.body.run.id}/close`).set(auth(adminToken));
    expect(closed.status).toBe(200);
    expect(closed.body.run.isCompleted).toBe(true);
  });

  // Regression test: creating a run with a milestoneId from a different project previously
  // succeeded with zero check, silently leaking a foreign project's milestone into this run.
  it('rejects a milestoneId that belongs to a different project', async () => {
    const { projectId, suiteId } = await seedSuiteWithCases();
    const otherProject = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: `Other Run Project ${Date.now()}` });
    const foreignMilestone = await request(app)
      .post(`/api/v1/projects/${otherProject.body.project.id}/milestones`)
      .set(auth(adminToken))
      .send({ name: 'Foreign Milestone' });

    const run = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Run With Foreign Milestone', suiteId, milestoneId: foreignMilestone.body.milestone.id });
    expect(run.status).toBe(404);
  });
});

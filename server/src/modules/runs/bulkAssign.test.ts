import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let testerId: string;

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'bulk-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const tester = await prisma.user.create({
    data: { email: 'bulk-tester@example.com', name: 'Tester', role: 'TESTER', passwordHash: await hashPassword('TesterPass123!') },
  });
  testerId = tester.id;
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
});

async function seedRunWithThreeCases() {
  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'Bulk Assign Project' });
  const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(auth()).send({ name: 'Suite' });
  const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth()).send({ name: 'Section' });
  for (const title of ['Case A', 'Case B', 'Case C']) {
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title });
  }
  const run = await request(app)
    .post(`/api/v1/projects/${project.body.project.id}/runs`)
    .set(auth())
    .send({ name: 'Bulk Run', suiteId: suite.body.suite.id });
  const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth());
  return { run: run.body.run, tests: tests.body.tests };
}

describe('bulk assign', () => {
  it('assigns multiple tests in one request', async () => {
    const { run, tests } = await seedRunWithThreeCases();
    const ids = tests.map((t: { id: string }) => t.id).slice(0, 2);

    const res = await request(app)
      .post(`/api/v1/runs/${run.id}/tests/bulk-assign`)
      .set(auth())
      .send({ testIds: ids, assignedToId: testerId });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const refreshed = await request(app).get(`/api/v1/runs/${run.id}/tests`).set(auth());
    const assigned = refreshed.body.tests.filter((t: { assignedToId: string }) => t.assignedToId === testerId);
    expect(assigned).toHaveLength(2);
    const untouched = refreshed.body.tests.find((t: { id: string }) => t.id === tests[2].id);
    expect(untouched.assignedToId).toBeNull();
  });

  it('can bulk-unassign by passing assignedToId: null', async () => {
    const { run, tests } = await seedRunWithThreeCases();
    const ids = tests.map((t: { id: string }) => t.id);
    await request(app).post(`/api/v1/runs/${run.id}/tests/bulk-assign`).set(auth()).send({ testIds: ids, assignedToId: testerId });

    const res = await request(app).post(`/api/v1/runs/${run.id}/tests/bulk-assign`).set(auth()).send({ testIds: ids, assignedToId: null });
    expect(res.body.updated).toBe(3);

    const refreshed = await request(app).get(`/api/v1/runs/${run.id}/tests`).set(auth());
    expect(refreshed.body.tests.every((t: { assignedToId: string | null }) => t.assignedToId === null)).toBe(true);
  });

  it('ignores test ids that belong to a different run', async () => {
    const { run: runA, tests: testsA } = await seedRunWithThreeCases();
    const { run: runB } = await seedRunWithThreeCases();

    const res = await request(app)
      .post(`/api/v1/runs/${runB.id}/tests/bulk-assign`)
      .set(auth())
      .send({ testIds: [testsA[0].id], assignedToId: testerId });
    expect(res.body.updated).toBe(0);

    const refreshed = await request(app).get(`/api/v1/runs/${runA.id}/tests`).set(auth());
    expect(refreshed.body.tests.find((t: { id: string }) => t.id === testsA[0].id).assignedToId).toBeNull();
  });

  it('rejects an empty testIds array', async () => {
    const { run } = await seedRunWithThreeCases();
    const res = await request(app).post(`/api/v1/runs/${run.id}/tests/bulk-assign`).set(auth()).send({ testIds: [], assignedToId: testerId });
    expect(res.status).toBe(400);
  });
});

describe('bulk result entry', () => {
  it('submits one status to multiple selected tests, creating a Result row for each and updating their denormalized status', async () => {
    const { run, tests } = await seedRunWithThreeCases();
    const ids = tests.map((t: { id: string }) => t.id).slice(0, 2);

    const res = await request(app)
      .post(`/api/v1/runs/${run.id}/tests/bulk-result`)
      .set(auth())
      .send({ testIds: ids, status: 'PASSED', comment: 'Bulk-passed' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const refreshed = await request(app).get(`/api/v1/runs/${run.id}/tests`).set(auth());
    const passed = refreshed.body.tests.filter((t: { status: string }) => t.status === 'PASSED');
    expect(passed).toHaveLength(2);
    const untouched = refreshed.body.tests.find((t: { id: string }) => t.id === tests[2].id);
    expect(untouched.status).toBe('UNTESTED');

    const history = await request(app).get(`/api/v1/tests/${ids[0]}/results`).set(auth());
    expect(history.body.results[0]).toMatchObject({ status: 'PASSED', comment: 'Bulk-passed' });
  });

  it('ignores test ids that belong to a different run', async () => {
    const { run: runA, tests: testsA } = await seedRunWithThreeCases();
    const { run: runB } = await seedRunWithThreeCases();

    const res = await request(app)
      .post(`/api/v1/runs/${runB.id}/tests/bulk-result`)
      .set(auth())
      .send({ testIds: [testsA[0].id], status: 'FAILED' });
    expect(res.body.updated).toBe(0);

    const refreshed = await request(app).get(`/api/v1/runs/${runA.id}/tests`).set(auth());
    expect(refreshed.body.tests.find((t: { id: string }) => t.id === testsA[0].id).status).toBe('UNTESTED');
  });

  // Real user-reported bug: the old testIds cap was 500, which a genuine "select all" on a
  // real-world 500+ case CSV import (this app's own bulk-import feature) exceeds routinely —
  // the request silently failed validation with no visible feedback on the client. Confirms the
  // cap was actually raised, not just that a small batch still works.
  it('accepts a bulk result submission well over the old 500-item cap', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'Large Bulk Result Project' });
    const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(auth()).send({ name: 'Suite' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth()).send({ name: 'Section' });
    await Promise.all(
      Array.from({ length: 501 }, (_, i) =>
        request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: `Case ${i}` }),
      ),
    );
    const run = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/runs`)
      .set(auth())
      .send({ name: 'Large Run', suiteId: suite.body.suite.id });
    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth());
    const ids = tests.body.tests.map((t: { id: string }) => t.id);
    expect(ids.length).toBe(501);

    const res = await request(app)
      .post(`/api/v1/runs/${run.body.run.id}/tests/bulk-result`)
      .set(auth())
      .send({ testIds: ids, status: 'PASSED' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(501);
  }, 30000);
});

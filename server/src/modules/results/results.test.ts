import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'result-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedRunWithStepsCase() {
  const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: `Results ${Date.now()}-${Math.random()}` });
  const projectId = project.body.project.id;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite' });
  const suiteId = suite.body.suite.id;
  const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth(adminToken)).send({ name: 'Section' });
  await request(app)
    .post(`/api/v1/sections/${section.body.section.id}/cases`)
    .set(auth(adminToken))
    .send({
      title: 'Multi-step case',
      template: 'STEPS',
      steps: [
        { step: 'Step one', expected: 'A' },
        { step: 'Step two', expected: 'B' },
      ],
    });
  const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth(adminToken)).send({ name: 'Run', suiteId });
  const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth(adminToken));
  return { testId: tests.body.tests[0].id as string, runId: run.body.run.id as string };
}

describe('per-step results', () => {
  it('accepts and returns a stepResults array positionally matching stepsSnapshot', async () => {
    const { testId } = await seedRunWithStepsCase();

    const submitted = await request(app)
      .post(`/api/v1/tests/${testId}/results`)
      .set(auth(adminToken))
      .send({
        status: 'FAILED',
        comment: 'Step 2 broke',
        stepResults: [
          { status: 'PASSED' },
          { status: 'FAILED', actual: 'Got a 500 error' },
        ],
      });
    expect(submitted.status).toBe(201);
    expect(submitted.body.result.stepResults).toEqual([{ status: 'PASSED' }, { status: 'FAILED', actual: 'Got a 500 error' }]);

    const history = await request(app).get(`/api/v1/tests/${testId}/results`).set(auth(adminToken));
    expect(history.body.results[0].stepResults).toEqual([{ status: 'PASSED' }, { status: 'FAILED', actual: 'Got a 500 error' }]);
  });

  it('leaves stepResults null when not provided', async () => {
    const { testId } = await seedRunWithStepsCase();
    const submitted = await request(app).post(`/api/v1/tests/${testId}/results`).set(auth(adminToken)).send({ status: 'PASSED' });
    expect(submitted.body.result.stepResults).toBeNull();
  });
});

describe('version and elapsed time', () => {
  it('accepts and returns version and elapsedMs on a result', async () => {
    const { testId } = await seedRunWithStepsCase();
    const submitted = await request(app)
      .post(`/api/v1/tests/${testId}/results`)
      .set(auth(adminToken))
      .send({ status: 'PASSED', version: '1.2.3', elapsedMs: 45000 });
    expect(submitted.status).toBe(201);
    expect(submitted.body.result.version).toBe('1.2.3');
    expect(submitted.body.result.elapsedMs).toBe(45000);

    const history = await request(app).get(`/api/v1/tests/${testId}/results`).set(auth(adminToken));
    expect(history.body.results[0]).toMatchObject({ version: '1.2.3', elapsedMs: 45000 });
  });

  it('rejects an elapsedMs value beyond the 24h cap with a clean 400, not a raw 500', async () => {
    const { testId } = await seedRunWithStepsCase();
    const res = await request(app)
      .post(`/api/v1/tests/${testId}/results`)
      .set(auth(adminToken))
      .send({ status: 'PASSED', elapsedMs: 3_000_000_000 });
    expect(res.status).toBe(400);
  });
});

// Regression tests: closed runs previously had zero server-side write protection on any of these
// four routes — only PATCH /runs/:id's date fields were ever guarded. Submitting a result,
// reassigning, and both bulk paths against a closed run all silently succeeded via direct API use
// even though the execution UI hides the controls that would trigger them.
describe('writes against a closed run', () => {
  it('rejects submitting a new result', async () => {
    const { testId, runId } = await seedRunWithStepsCase();
    await request(app).post(`/api/v1/runs/${runId}/close`).set(auth(adminToken));
    const res = await request(app).post(`/api/v1/tests/${testId}/results`).set(auth(adminToken)).send({ status: 'PASSED' });
    expect(res.status).toBe(400);
  });

  it('rejects reassigning a test', async () => {
    const { testId, runId } = await seedRunWithStepsCase();
    await request(app).post(`/api/v1/runs/${runId}/close`).set(auth(adminToken));
    const res = await request(app).patch(`/api/v1/tests/${testId}`).set(auth(adminToken)).send({ assignedToId: null });
    expect(res.status).toBe(400);
  });

  it('rejects bulk-assign', async () => {
    const { testId, runId } = await seedRunWithStepsCase();
    await request(app).post(`/api/v1/runs/${runId}/close`).set(auth(adminToken));
    const res = await request(app)
      .post(`/api/v1/runs/${runId}/tests/bulk-assign`)
      .set(auth(adminToken))
      .send({ testIds: [testId], assignedToId: null });
    expect(res.status).toBe(400);
  });

  it('rejects bulk-result', async () => {
    const { testId, runId } = await seedRunWithStepsCase();
    await request(app).post(`/api/v1/runs/${runId}/close`).set(auth(adminToken));
    const res = await request(app)
      .post(`/api/v1/runs/${runId}/tests/bulk-result`)
      .set(auth(adminToken))
      .send({ testIds: [testId], status: 'PASSED' });
    expect(res.status).toBe(400);
  });

  it('rejects PATCH /runs/:id bulk-reassigning every test via assignedToId', async () => {
    const { runId } = await seedRunWithStepsCase();
    await request(app).post(`/api/v1/runs/${runId}/close`).set(auth(adminToken));
    const res = await request(app).patch(`/api/v1/runs/${runId}`).set(auth(adminToken)).send({ assignedToId: null });
    expect(res.status).toBe(400);
  });
});

describe('assignedToId validation', () => {
  it('rejects a nonexistent assignedToId on single reassign with a clean 404, not a raw 500', async () => {
    const { testId } = await seedRunWithStepsCase();
    const res = await request(app).patch(`/api/v1/tests/${testId}`).set(auth(adminToken)).send({ assignedToId: 'nonexistent-user-id' });
    expect(res.status).toBe(404);
  });
});

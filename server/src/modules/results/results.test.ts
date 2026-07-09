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
  return tests.body.tests[0].id as string;
}

describe('per-step results', () => {
  it('accepts and returns a stepResults array positionally matching stepsSnapshot', async () => {
    const testId = await seedRunWithStepsCase();

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
    const testId = await seedRunWithStepsCase();
    const submitted = await request(app).post(`/api/v1/tests/${testId}/results`).set(auth(adminToken)).send({ status: 'PASSED' });
    expect(submitted.body.result.stepResults).toBeNull();
  });
});

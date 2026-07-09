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
});

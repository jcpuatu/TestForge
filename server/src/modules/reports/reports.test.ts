import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'dash-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
});

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

describe('cross-project dashboard', () => {
  it('aggregates counts and active-run status totals across every project', async () => {
    const projectA = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Dash A ${Date.now()}` });
    const suiteA = await request(app).post(`/api/v1/projects/${projectA.body.project.id}/suites`).set(auth()).send({ name: 'Suite' });
    const sectionA = await request(app).post(`/api/v1/suites/${suiteA.body.suite.id}/sections`).set(auth()).send({ name: 'Section' });
    await request(app).post(`/api/v1/sections/${sectionA.body.section.id}/cases`).set(auth()).send({ title: 'Case' });
    const runA = await request(app)
      .post(`/api/v1/projects/${projectA.body.project.id}/runs`)
      .set(auth())
      .send({ name: 'Run', suiteId: suiteA.body.suite.id });
    const testsA = await request(app).get(`/api/v1/runs/${runA.body.run.id}/tests`).set(auth());
    await request(app).post(`/api/v1/tests/${testsA.body.tests[0].id}/results`).set(auth()).send({ status: 'PASSED' });

    const res = await request(app).get('/api/v1/dashboard').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.counts.projects).toBeGreaterThanOrEqual(1);
    const projectEntry = res.body.projects.find((p: { id: string }) => p.id === projectA.body.project.id);
    expect(projectEntry).toBeTruthy();
    expect(projectEntry.counts).toEqual({ suites: 1, cases: 1, runs: 1, milestones: 0 });
    expect(projectEntry.statusCounts.PASSED).toBe(1);
    expect(res.body.totals.PASSED).toBeGreaterThanOrEqual(1);
    expect(res.body.passRate).toBeGreaterThan(0);
  });

  it('excludes tests from closed runs out of the active-status totals', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Dash Closed ${Date.now()}` });
    const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(auth()).send({ name: 'Suite' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth()).send({ name: 'Section' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Case' });
    const run = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/runs`)
      .set(auth())
      .send({ name: 'Run', suiteId: suite.body.suite.id });
    await request(app).post(`/api/v1/runs/${run.body.run.id}/close`).set(auth());

    const res = await request(app).get('/api/v1/dashboard').set(auth());
    const projectEntry = res.body.projects.find((p: { id: string }) => p.id === project.body.project.id);
    expect(projectEntry.total).toBe(0);
  });
});

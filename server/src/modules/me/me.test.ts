import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let testerToken: string;
let testerId: string;

function authAs(token: string) {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'me-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const tester = await prisma.user.create({
    data: { email: 'me-tester@example.com', name: 'Tester', role: 'TESTER', passwordHash: await hashPassword('TesterPass123!') },
  });
  testerId = tester.id;

  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
  testerToken = (await request(app).post('/api/v1/auth/login').send({ email: tester.email, password: 'TesterPass123!' })).body.accessToken;
});

describe('user directory', () => {
  it('is visible to any authenticated user, not just admins', async () => {
    const res = await request(app).get('/api/v1/users/directory').set(authAs(testerToken));
    expect(res.status).toBe(200);
    expect(res.body.users.some((u: { id: string }) => u.id === testerId)).toBe(true);
    // Should not leak email/sensitive fields — directory is name/role/id only.
    expect(res.body.users[0].email).toBeUndefined();
  });
});

describe('test assignment and /me/tests', () => {
  it('shows a test in /me/tests once assigned, and stops once the run closes', async () => {
    const project = await request(app).post('/api/v1/projects').set(authAs(adminToken)).send({ name: 'Me Project' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(authAs(adminToken))
      .send({ name: 'Suite' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(authAs(adminToken)).send({ name: 'Section' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(authAs(adminToken)).send({ title: 'Case' });
    const run = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/runs`)
      .set(authAs(adminToken))
      .send({ name: 'Run', suiteId: suite.body.suite.id });
    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(authAs(adminToken));
    const testId = tests.body.tests[0].id;

    const before = await request(app).get('/api/v1/me/tests').set(authAs(testerToken));
    expect(before.body.tests.find((t: { id: string }) => t.id === testId)).toBeUndefined();

    const assign = await request(app).patch(`/api/v1/tests/${testId}`).set(authAs(testerToken)).send({ assignedToId: testerId });
    expect(assign.status).toBe(200);
    expect(assign.body.test.assignedToId).toBe(testerId);

    const after = await request(app).get('/api/v1/me/tests').set(authAs(testerToken));
    expect(after.body.tests.find((t: { id: string }) => t.id === testId)).toBeTruthy();

    await request(app).post(`/api/v1/runs/${run.body.run.id}/close`).set(authAs(adminToken));
    const afterClose = await request(app).get('/api/v1/me/tests').set(authAs(testerToken));
    expect(afterClose.body.tests.find((t: { id: string }) => t.id === testId)).toBeUndefined();
  });

  it('lets an ADMIN view another user\'s test list via ?userId, but a TESTER cannot view someone else\'s', async () => {
    const project = await request(app).post('/api/v1/projects').set(authAs(adminToken)).send({ name: 'Me Project 2' });
    const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(authAs(adminToken)).send({ name: 'Suite' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(authAs(adminToken)).send({ name: 'Section' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(authAs(adminToken)).send({ title: 'Case' });
    const run = await request(app).post(`/api/v1/projects/${project.body.project.id}/runs`).set(authAs(adminToken)).send({ name: 'Run', suiteId: suite.body.suite.id });
    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(authAs(adminToken));
    await request(app).patch(`/api/v1/tests/${tests.body.tests[0].id}`).set(authAs(adminToken)).send({ assignedToId: testerId });

    const asAdmin = await request(app).get(`/api/v1/me/tests?userId=${testerId}`).set(authAs(adminToken));
    expect(asAdmin.body.tests.find((t: { id: string }) => t.id === tests.body.tests[0].id)).toBeTruthy();

    const otherTester = await prisma.user.create({
      data: { email: 'me-other-tester@example.com', name: 'Other Tester', role: 'TESTER', passwordHash: await hashPassword('TesterPass123!') },
    });
    const otherToken = (await request(app).post('/api/v1/auth/login').send({ email: otherTester.email, password: 'TesterPass123!' })).body.accessToken;
    const asTester = await request(app).get(`/api/v1/me/tests?userId=${testerId}`).set(authAs(otherToken));
    expect(asTester.body.tests.find((t: { id: string }) => t.id === tests.body.tests[0].id)).toBeUndefined();
  });
});

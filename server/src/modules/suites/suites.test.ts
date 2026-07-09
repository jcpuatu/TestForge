import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'suite-admin@example.com', name: 'Suite Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = login.body.accessToken;
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('suite update/delete', () => {
  it('renames a suite', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Rename Project' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(auth(adminToken))
      .send({ name: 'Old Name' });

    const renamed = await request(app).patch(`/api/v1/suites/${suite.body.suite.id}`).set(auth(adminToken)).send({ name: 'New Name' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.suite.name).toBe('New Name');
  });

  it('delete-impact reports case count and active/closed run counts', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Impact Project' });
    const projectId = project.body.project.id;
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite' });
    const suiteId = suite.body.suite.id;
    const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth(adminToken)).send({ name: 'Section' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth(adminToken)).send({ title: 'Case' });

    const activeRun = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Active Run', suiteId });
    const closedRun = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Closed Run', suiteId });
    await request(app).post(`/api/v1/runs/${closedRun.body.run.id}/close`).set(auth(adminToken));

    const impact = await request(app).get(`/api/v1/suites/${suiteId}/delete-impact`).set(auth(adminToken));
    expect(impact.status).toBe(200);
    expect(impact.body).toEqual({ caseCount: 1, activeRunCount: 1, closedRunCount: 1 });

    // Sanity: the active run really is the one still open.
    const activeRunCheck = await prisma.testRun.findUnique({ where: { id: activeRun.body.run.id } });
    expect(activeRunCheck?.isCompleted).toBe(false);
  });

  it('deleting a suite hard-deletes its cases and active runs, but preserves closed runs — matches real TestRail', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Cascade Project' });
    const projectId = project.body.project.id;
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite' });
    const suiteId = suite.body.suite.id;
    const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth(adminToken)).send({ name: 'Section' });
    const testCase = await request(app)
      .post(`/api/v1/sections/${section.body.section.id}/cases`)
      .set(auth(adminToken))
      .send({ title: 'Case' });

    const activeRun = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Active Run', suiteId });
    const closedRun = await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Closed Run', suiteId });
    await request(app).post(`/api/v1/runs/${closedRun.body.run.id}/close`).set(auth(adminToken));

    const del = await request(app).delete(`/api/v1/suites/${suiteId}`).set(auth(adminToken));
    expect(del.status).toBe(204);

    const dbCase = await prisma.testCase.findUnique({ where: { id: testCase.body.case.id } });
    expect(dbCase).toBeNull();

    const dbActiveRun = await prisma.testRun.findUnique({ where: { id: activeRun.body.run.id } });
    expect(dbActiveRun).toBeNull();

    const dbClosedRun = await prisma.testRun.findUnique({ where: { id: closedRun.body.run.id } });
    expect(dbClosedRun).not.toBeNull();
    expect(dbClosedRun?.suiteId).toBeNull();
  });

  // Regression test: Section.parent uses onDelete: Restrict for its self-relation (nesting).
  // A naive `prisma.suite.delete()` cascades to Section with no guaranteed child-before-parent
  // order, so a suite containing a parent+child section pair used to throw a raw Prisma FK
  // error (surfaced to the client as a generic 500 "Something went wrong"). Caught via live
  // browser + manual API testing, not by the earlier (non-nested) delete test above.
  it('deletes a suite containing nested sections without a foreign-key error', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Nested Delete Project' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(auth(adminToken))
      .send({ name: 'Suite' });
    const suiteId = suite.body.suite.id;

    const parent = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth(adminToken)).send({ name: 'Parent' });
    await request(app)
      .post(`/api/v1/suites/${suiteId}/sections`)
      .set(auth(adminToken))
      .send({ name: 'Child', parentId: parent.body.section.id });

    const del = await request(app).delete(`/api/v1/suites/${suiteId}`).set(auth(adminToken));
    expect(del.status).toBe(204);
  });
});

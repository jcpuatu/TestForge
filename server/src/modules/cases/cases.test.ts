import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let testerToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'lead@example.com', name: 'Lead', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  await prisma.user.create({
    data: { email: 'tester@example.com', name: 'Tester', role: 'TESTER', passwordHash: await hashPassword('TesterPass123!') },
  });

  const adminLogin = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = adminLogin.body.accessToken;

  const testerLogin = await request(app).post('/api/v1/auth/login').send({ email: 'tester@example.com', password: 'TesterPass123!' });
  testerToken = testerLogin.body.accessToken;
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('project → suite → section → case CRUD', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/projects');
    expect(res.status).toBe(401);
  });

  it('rejects a TESTER creating a project (LEAD/ADMIN only)', async () => {
    const res = await request(app).post('/api/v1/projects').set(auth(testerToken)).send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('walks the full hierarchy end to end', async () => {
    const project = await request(app)
      .post('/api/v1/projects')
      .set(auth(adminToken))
      .send({ name: 'Online Banking', description: 'Core flows' });
    expect(project.status).toBe(201);
    const projectId = project.body.project.id;

    const suite = await request(app)
      .post(`/api/v1/projects/${projectId}/suites`)
      .set(auth(adminToken))
      .send({ name: 'Fund Transfers' });
    expect(suite.status).toBe(201);
    const suiteId = suite.body.suite.id;

    const section = await request(app)
      .post(`/api/v1/suites/${suiteId}/sections`)
      .set(auth(adminToken))
      .send({ name: 'Internal Transfers' });
    expect(section.status).toBe(201);
    const sectionId = section.body.section.id;

    // TESTER role is allowed to author cases even though it can't manage structure.
    const testCase = await request(app)
      .post(`/api/v1/sections/${sectionId}/cases`)
      .set(auth(testerToken))
      .send({
        title: 'Transfer with insufficient funds shows error',
        priority: 'HIGH',
        steps: [{ step: 'Enter amount greater than balance', expected: 'Error shown' }],
      });
    expect(testCase.status).toBe(201);
    expect(testCase.body.case.steps).toEqual([{ step: 'Enter amount greater than balance', expected: 'Error shown' }]);
    const caseId = testCase.body.case.id;

    const list = await request(app).get(`/api/v1/suites/${suiteId}/cases`).set(auth(testerToken));
    expect(list.status).toBe(200);
    expect(list.body.cases).toHaveLength(1);
    expect(list.body.cases[0].id).toBe(caseId);

    const del = await request(app).delete(`/api/v1/cases/${caseId}`).set(auth(adminToken));
    expect(del.status).toBe(204);

    const listAfterDelete = await request(app).get(`/api/v1/suites/${suiteId}/cases`).set(auth(adminToken));
    expect(listAfterDelete.body.cases).toHaveLength(0);
  });

  it('cascade-deletes subsections and their cases on section delete, matching real TestRail', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Cascade Test' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(auth(adminToken))
      .send({ name: 'Suite' });
    const suiteId = suite.body.suite.id;

    const parent = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth(adminToken)).send({ name: 'Parent' });
    const child = await request(app)
      .post(`/api/v1/suites/${suiteId}/sections`)
      .set(auth(adminToken))
      .send({ name: 'Child', parentId: parent.body.section.id });
    expect(child.body.section.parentId).toBe(parent.body.section.id);

    const caseInParent = await request(app)
      .post(`/api/v1/sections/${parent.body.section.id}/cases`)
      .set(auth(adminToken))
      .send({ title: 'Case in parent' });
    const caseInChild = await request(app)
      .post(`/api/v1/sections/${child.body.section.id}/cases`)
      .set(auth(adminToken))
      .send({ title: 'Case in child' });

    const impact = await request(app).get(`/api/v1/sections/${parent.body.section.id}/delete-impact`).set(auth(adminToken));
    expect(impact.status).toBe(200);
    expect(impact.body).toEqual({ caseCount: 2, subsectionCount: 1 });

    const del = await request(app).delete(`/api/v1/sections/${parent.body.section.id}`).set(auth(adminToken));
    expect(del.status).toBe(204);

    const sections = await request(app).get(`/api/v1/suites/${suiteId}/sections`).set(auth(adminToken));
    expect(sections.body.sections).toHaveLength(0);

    const remainingCases = await request(app).get(`/api/v1/suites/${suiteId}/cases`).set(auth(adminToken));
    expect(remainingCases.body.cases).toHaveLength(0);

    // Hard-deleted, not soft-deleted — confirm via direct DB lookup since the list endpoints filter isDeleted.
    const dbCase = await prisma.testCase.findUnique({ where: { id: caseInParent.body.case.id } });
    expect(dbCase).toBeNull();
    const dbChildCase = await prisma.testCase.findUnique({ where: { id: caseInChild.body.case.id } });
    expect(dbChildCase).toBeNull();
  });

  it('restores a soft-deleted case, and bulk-restores multiple at once', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Restore Test' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(auth(adminToken))
      .send({ name: 'Suite' });
    const section = await request(app)
      .post(`/api/v1/suites/${suite.body.suite.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'Section' });
    const sectionId = section.body.section.id;

    const caseA = await request(app).post(`/api/v1/sections/${sectionId}/cases`).set(auth(adminToken)).send({ title: 'Case A' });
    const caseB = await request(app).post(`/api/v1/sections/${sectionId}/cases`).set(auth(adminToken)).send({ title: 'Case B' });

    await request(app).delete(`/api/v1/cases/${caseA.body.case.id}`).set(auth(adminToken));
    await request(app).delete(`/api/v1/cases/${caseB.body.case.id}`).set(auth(adminToken));

    const deletedList = await request(app).get(`/api/v1/sections/${sectionId}/cases?deleted=true`).set(auth(adminToken));
    expect(deletedList.body.cases).toHaveLength(2);

    const restoreA = await request(app).post(`/api/v1/cases/${caseA.body.case.id}/restore`).set(auth(adminToken));
    expect(restoreA.status).toBe(200);
    expect(restoreA.body.case.isDeleted).toBe(false);

    const bulkRestore = await request(app)
      .post('/api/v1/cases/bulk-restore')
      .set(auth(adminToken))
      .send({ caseIds: [caseB.body.case.id] });
    expect(bulkRestore.status).toBe(200);
    expect(bulkRestore.body.restored).toBe(1);

    const activeList = await request(app).get(`/api/v1/sections/${sectionId}/cases`).set(auth(adminToken));
    expect(activeList.body.cases).toHaveLength(2);
  });

  it('permanently deletes a case only after it has been soft-deleted first', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Permanent Delete Test' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(auth(adminToken))
      .send({ name: 'Suite' });
    const section = await request(app)
      .post(`/api/v1/suites/${suite.body.suite.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'Section' });
    const testCase = await request(app)
      .post(`/api/v1/sections/${section.body.section.id}/cases`)
      .set(auth(adminToken))
      .send({ title: 'Case' });
    const caseId = testCase.body.case.id;

    const tooSoon = await request(app).delete(`/api/v1/cases/${caseId}/permanent`).set(auth(adminToken));
    expect(tooSoon.status).toBe(400);

    await request(app).delete(`/api/v1/cases/${caseId}`).set(auth(adminToken));

    const permanent = await request(app).delete(`/api/v1/cases/${caseId}/permanent`).set(auth(adminToken));
    expect(permanent.status).toBe(204);

    const dbCase = await prisma.testCase.findUnique({ where: { id: caseId } });
    expect(dbCase).toBeNull();
  });
});

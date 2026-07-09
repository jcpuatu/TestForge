import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let projectId: string;
let suiteId: string;
let sectionAId: string;
let sectionBId: string;

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'bulk-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = login.body.accessToken;

  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'Bulk Project' });
  projectId = project.body.project.id;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
  suiteId = suite.body.suite.id;
  const sectionA = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'A' });
  sectionAId = sectionA.body.section.id;
  const sectionB = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'B' });
  sectionBId = sectionB.body.section.id;
});

async function makeCases(n: number, sectionId: string) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const res = await request(app).post(`/api/v1/sections/${sectionId}/cases`).set(auth()).send({ title: `Case ${i}` });
    ids.push(res.body.case.id);
  }
  return ids;
}

describe('bulk case operations', () => {
  it('bulk-updates priority and type across multiple cases in one call', async () => {
    const ids = await makeCases(3, sectionAId);
    const res = await request(app)
      .patch('/api/v1/cases/bulk-update')
      .set(auth())
      .send({ caseIds: ids, priority: 'CRITICAL', type: 'SECURITY' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(3);

    for (const id of ids) {
      const c = await request(app).get(`/api/v1/cases/${id}`).set(auth());
      expect(c.body.case.priority).toBe('CRITICAL');
      expect(c.body.case.type).toBe('SECURITY');
    }
  });

  it('bulk-updates sectionId to move multiple cases at once', async () => {
    const ids = await makeCases(2, sectionAId);
    const res = await request(app).patch('/api/v1/cases/bulk-update').set(auth()).send({ caseIds: ids, sectionId: sectionBId });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const sectionBCases = await request(app).get(`/api/v1/sections/${sectionBId}/cases`).set(auth());
    const titles = sectionBCases.body.cases.map((c: { id: string }) => c.id);
    for (const id of ids) expect(titles).toContain(id);
  });

  it('rejects bulk-update with no fields to update', async () => {
    const ids = await makeCases(1, sectionAId);
    const res = await request(app).patch('/api/v1/cases/bulk-update').set(auth()).send({ caseIds: ids });
    expect(res.status).toBe(400);
  });

  it('bulk-deletes (soft) multiple cases, only affecting non-deleted ones', async () => {
    const ids = await makeCases(2, sectionAId);
    const res = await request(app).post('/api/v1/cases/bulk-delete').set(auth()).send({ caseIds: ids });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);

    const activeList = await request(app).get(`/api/v1/sections/${sectionAId}/cases`).set(auth());
    for (const id of ids) expect(activeList.body.cases.map((c: { id: string }) => c.id)).not.toContain(id);

    // Calling bulk-delete again on the same (already-deleted) ids matches nothing.
    const again = await request(app).post('/api/v1/cases/bulk-delete').set(auth()).send({ caseIds: ids });
    expect(again.body.deleted).toBe(0);
  });

  it('bulk-add-labels is additive and skips pairs a case already has, without erroring', async () => {
    const label1 = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth()).send({ name: 'BulkLabel1' });
    const label2 = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth()).send({ name: 'BulkLabel2' });
    const ids = await makeCases(2, sectionAId);

    // Pre-tag one case with label1 already.
    await request(app).patch(`/api/v1/cases/${ids[0]}`).set(auth()).send({ labelIds: [label1.body.label.id] });

    const res = await request(app)
      .post('/api/v1/cases/bulk-add-labels')
      .set(auth())
      .send({ caseIds: ids, labelIds: [label1.body.label.id, label2.body.label.id] });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const case0 = await request(app).get(`/api/v1/cases/${ids[0]}`).set(auth());
    expect(case0.body.case.labels.map((l: { name: string }) => l.name).sort()).toEqual(['BulkLabel1', 'BulkLabel2']);
    const case1 = await request(app).get(`/api/v1/cases/${ids[1]}`).set(auth());
    expect(case1.body.case.labels.map((l: { name: string }) => l.name).sort()).toEqual(['BulkLabel1', 'BulkLabel2']);
  });
});

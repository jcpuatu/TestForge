import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let testerToken: string;
let projectId: string;

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'label-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  await prisma.user.create({
    data: { email: 'label-tester@example.com', name: 'Tester', role: 'TESTER', passwordHash: await hashPassword('TesterPass123!') },
  });
  const adminLogin = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = adminLogin.body.accessToken;
  const testerLogin = await request(app).post('/api/v1/auth/login').send({ email: 'label-tester@example.com', password: 'TesterPass123!' });
  testerToken = testerLogin.body.accessToken;

  const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Label Project' });
  projectId = project.body.project.id;
});

describe('labels', () => {
  it('creates, lists, and rejects a duplicate name (case-insensitive)', async () => {
    const created = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth(adminToken)).send({ name: 'Smoke' });
    expect(created.status).toBe(201);

    const dup = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth(adminToken)).send({ name: 'smoke' });
    expect(dup.status).toBe(400);

    const list = await request(app).get(`/api/v1/projects/${projectId}/labels`).set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.labels.map((l: { name: string }) => l.name)).toEqual(['Smoke']);
  });

  it('rejects a TESTER creating a label (ADMIN/LEAD only)', async () => {
    const res = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth(testerToken)).send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('renames a label and the new name is reflected on already-tagged cases', async () => {
    const label = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth(adminToken)).send({ name: 'Regression' });
    const labelId = label.body.label.id;

    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth(adminToken)).send({ name: 'Sec' });
    const testCase = await request(app)
      .post(`/api/v1/sections/${section.body.section.id}/cases`)
      .set(auth(adminToken))
      .send({ title: 'Tagged case', labelIds: [labelId] });
    expect(testCase.body.case.labels.map((l: { name: string }) => l.name)).toEqual(['Regression']);

    const renamed = await request(app).patch(`/api/v1/labels/${labelId}`).set(auth(adminToken)).send({ name: 'Regression Suite' });
    expect(renamed.status).toBe(200);

    const refetched = await request(app).get(`/api/v1/cases/${testCase.body.case.id}`).set(auth(adminToken));
    expect(refetched.body.case.labels.map((l: { name: string }) => l.name)).toEqual(['Regression Suite']);
  });

  it('deleting a label removes it from every case that had it', async () => {
    const label = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth(adminToken)).send({ name: 'Deleteme' });
    const labelId = label.body.label.id;
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite2' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth(adminToken)).send({ name: 'Sec2' });
    const testCase = await request(app)
      .post(`/api/v1/sections/${section.body.section.id}/cases`)
      .set(auth(adminToken))
      .send({ title: 'Case with deleted label', labelIds: [labelId] });

    const del = await request(app).delete(`/api/v1/labels/${labelId}`).set(auth(adminToken));
    expect(del.status).toBe(204);

    const refetched = await request(app).get(`/api/v1/cases/${testCase.body.case.id}`).set(auth(adminToken));
    expect(refetched.body.case.labels).toEqual([]);
  });

  it('updating a case replaces its full label set (not additive)', async () => {
    const labelA = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth(adminToken)).send({ name: 'A' });
    const labelB = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth(adminToken)).send({ name: 'B' });
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite3' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth(adminToken)).send({ name: 'Sec3' });
    const testCase = await request(app)
      .post(`/api/v1/sections/${section.body.section.id}/cases`)
      .set(auth(adminToken))
      .send({ title: 'Replace test', labelIds: [labelA.body.label.id] });

    const updated = await request(app)
      .patch(`/api/v1/cases/${testCase.body.case.id}`)
      .set(auth(adminToken))
      .send({ labelIds: [labelB.body.label.id] });
    expect(updated.body.case.labels.map((l: { name: string }) => l.name)).toEqual(['B']);
  });

  it('filters the suite-wide case list by labelIds', async () => {
    const label = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth(adminToken)).send({ name: 'FilterMe' });
    const labelId = label.body.label.id;
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite4' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth(adminToken)).send({ name: 'Sec4' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth(adminToken)).send({ title: 'Tagged', labelIds: [labelId] });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth(adminToken)).send({ title: 'Untagged' });

    const res = await request(app).get(`/api/v1/suites/${suite.body.suite.id}/cases?labelIds=${labelId}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.cases.map((c: { title: string }) => c.title)).toEqual(['Tagged']);
  });
});

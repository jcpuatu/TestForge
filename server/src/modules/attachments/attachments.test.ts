import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let viewerToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'attach-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const viewer = await prisma.user.create({
    data: { email: 'attach-viewer@example.com', name: 'Viewer', role: 'VIEWER', passwordHash: await hashPassword('ViewerPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
  viewerToken = (await request(app).post('/api/v1/auth/login').send({ email: viewer.email, password: 'ViewerPass123!' })).body.accessToken;
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedCaseAndResult() {
  const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: `Attach ${Date.now()}-${Math.random()}` });
  const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(auth(adminToken)).send({ name: 'Suite' });
  const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth(adminToken)).send({ name: 'Section' });
  const testCase = await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth(adminToken)).send({ title: 'Case' });
  const run = await request(app)
    .post(`/api/v1/projects/${project.body.project.id}/runs`)
    .set(auth(adminToken))
    .send({ name: 'Run', suiteId: suite.body.suite.id });
  const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth(adminToken));
  const submitted = await request(app).post(`/api/v1/tests/${tests.body.tests[0].id}/results`).set(auth(adminToken)).send({ status: 'FAILED' });
  return { caseId: testCase.body.case.id, resultId: submitted.body.result.id };
}

describe('attachments', () => {
  it('uploads, lists, downloads, and deletes a case attachment', async () => {
    const { caseId } = await seedCaseAndResult();

    const upload = await request(app)
      .post(`/api/v1/cases/${caseId}/attachments`)
      .set(auth(adminToken))
      .attach('file', Buffer.from('hello world'), 'notes.txt');
    expect(upload.status).toBe(201);
    expect(upload.body.attachment.filename).toBe('notes.txt');
    expect(upload.body.attachment.storagePath).toBeUndefined(); // never exposed to the client
    const attachmentId = upload.body.attachment.id;

    const list = await request(app).get(`/api/v1/cases/${caseId}/attachments`).set(auth(adminToken));
    expect(list.body.attachments).toHaveLength(1);
    expect(list.body.attachments[0].uploadedBy.name).toBe('Admin');

    const download = await request(app).get(`/api/v1/attachments/${attachmentId}`).set(auth(adminToken));
    expect(download.status).toBe(200);
    expect(download.text).toBe('hello world');
    expect(download.headers['content-disposition']).toContain('attachment');

    const del = await request(app).delete(`/api/v1/attachments/${attachmentId}`).set(auth(adminToken));
    expect(del.status).toBe(204);
    const afterDelete = await request(app).get(`/api/v1/attachments/${attachmentId}`).set(auth(adminToken));
    expect(afterDelete.status).toBe(404);
  });

  it('uploads and lists a result attachment separately from case attachments', async () => {
    const { caseId, resultId } = await seedCaseAndResult();
    await request(app).post(`/api/v1/results/${resultId}/attachments`).set(auth(adminToken)).attach('file', Buffer.from('screenshot'), 'shot.png');

    const resultAttachments = await request(app).get(`/api/v1/results/${resultId}/attachments`).set(auth(adminToken));
    expect(resultAttachments.body.attachments).toHaveLength(1);
    const caseAttachments = await request(app).get(`/api/v1/cases/${caseId}/attachments`).set(auth(adminToken));
    expect(caseAttachments.body.attachments).toHaveLength(0);
  });

  it('rejects a VIEWER uploading or deleting, but allows viewing', async () => {
    const { caseId } = await seedCaseAndResult();
    const upload = await request(app)
      .post(`/api/v1/cases/${caseId}/attachments`)
      .set(auth(adminToken))
      .attach('file', Buffer.from('x'), 'a.txt');

    const viewerUpload = await request(app)
      .post(`/api/v1/cases/${caseId}/attachments`)
      .set(auth(viewerToken))
      .attach('file', Buffer.from('x'), 'b.txt');
    expect(viewerUpload.status).toBe(403);

    const viewerDelete = await request(app).delete(`/api/v1/attachments/${upload.body.attachment.id}`).set(auth(viewerToken));
    expect(viewerDelete.status).toBe(403);

    const viewerList = await request(app).get(`/api/v1/cases/${caseId}/attachments`).set(auth(viewerToken));
    expect(viewerList.status).toBe(200);
  });
});

import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let suiteId: string;

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'move-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = login.body.accessToken;

  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'Move Project' });
  const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(auth()).send({ name: 'Suite' });
  suiteId = suite.body.suite.id;
});

describe('section move/reorder', () => {
  it('reorders siblings at the same level', async () => {
    const a = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'A' });
    const b = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'B' });
    const c = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'C' });

    // Move C to the front.
    const res = await request(app)
      .post(`/api/v1/sections/${c.body.section.id}/move`)
      .set(auth())
      .send({ parentId: null, orderIndex: 0 });
    expect(res.status).toBe(200);

    const list = await request(app).get(`/api/v1/suites/${suiteId}/sections`).set(auth());
    const topLevel = list.body.sections.filter((s: { parentId: string | null }) => s.parentId === null);
    const names = topLevel.sort((x: { orderIndex: number }, y: { orderIndex: number }) => x.orderIndex - y.orderIndex).map((s: { name: string }) => s.name);
    expect(names).toEqual(['C', 'A', 'B']);
    expect(topLevel.map((s: { orderIndex: number }) => s.orderIndex).sort()).toEqual([0, 1, 2]);
  });

  it('reparents a section into a new parent', async () => {
    const parent = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Parent' });
    const child = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Child' });

    const res = await request(app)
      .post(`/api/v1/sections/${child.body.section.id}/move`)
      .set(auth())
      .send({ parentId: parent.body.section.id, orderIndex: 0 });
    expect(res.status).toBe(200);

    const moved = res.body.sections.find((s: { id: string }) => s.id === child.body.section.id);
    expect(moved.parentId).toBe(parent.body.section.id);
  });

  it('rejects moving a section into its own subsection (would create a cycle)', async () => {
    const parent = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'CycleParent' });
    const child = await request(app)
      .post(`/api/v1/suites/${suiteId}/sections`)
      .set(auth())
      .send({ name: 'CycleChild', parentId: parent.body.section.id });

    const res = await request(app)
      .post(`/api/v1/sections/${parent.body.section.id}/move`)
      .set(auth())
      .send({ parentId: child.body.section.id, orderIndex: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects moving a section into itself', async () => {
    const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'SelfMove' });
    const res = await request(app)
      .post(`/api/v1/sections/${section.body.section.id}/move`)
      .set(auth())
      .send({ parentId: section.body.section.id, orderIndex: 0 });
    expect(res.status).toBe(400);
  });
});

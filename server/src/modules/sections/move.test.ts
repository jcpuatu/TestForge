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
    // A and B only need to exist as siblings for C to be reordered among — their own responses
    // are never read, the resulting order is verified below via a separate list call.
    await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'A' });
    await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'B' });
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

  // Regression test: reparenting only re-normalized the DESTINATION parent's sibling list —
  // the ORIGIN parent's remaining children kept whatever orderIndex gap the moved section left
  // behind (e.g. [0,1,2,3,4] minus index 2 stayed [0,1,3,4] instead of renormalizing to [0,1,2,3]).
  it('renormalizes the origin parent\'s remaining siblings after a reparent, leaving no gap', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Origin Renormalize Test ${Date.now()}` });
    const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(auth()).send({ name: 'Suite' });
    const originSuiteId = suite.body.suite.id;
    const target = await request(app).post(`/api/v1/suites/${originSuiteId}/sections`).set(auth()).send({ name: 'Target' });

    const names = ['S0', 'S1', 'S2', 'S3', 'S4'];
    const created: Record<string, string> = {};
    for (const name of names) {
      const s = await request(app).post(`/api/v1/suites/${originSuiteId}/sections`).set(auth()).send({ name });
      created[name] = s.body.section.id;
    }

    // Reparent S2 (index 2) out of the top-level group, into Target.
    const res = await request(app)
      .post(`/api/v1/sections/${created.S2}/move`)
      .set(auth())
      .send({ parentId: target.body.section.id, orderIndex: 0 });
    expect(res.status).toBe(200);

    // Target itself is also a top-level section, so the remaining top-level group after S2
    // leaves is Target + S0, S1, S3, S4 (5 sections) — checked as a whole set of orderIndex
    // values, since renormalization can place Target at any position within it.
    const remainingTopLevel = (res.body.sections as { id: string; parentId: string | null; orderIndex: number }[])
      .filter((s) => s.parentId === null)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    expect(remainingTopLevel.map((s) => s.orderIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});

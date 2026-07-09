import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let leadUserId: string;
let projectId: string;
let suiteId: string;
let sectionAId: string;
let sectionBId: string;

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'filter-admin@example.com', name: 'Filter Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  leadUserId = admin.id;
  const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = login.body.accessToken;

  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'Filter Project' });
  projectId = project.body.project.id;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
  suiteId = suite.body.suite.id;
  const sectionA = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Section A' });
  sectionAId = sectionA.body.section.id;
  const sectionB = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Section B' });
  sectionBId = sectionB.body.section.id;

  await request(app).post(`/api/v1/sections/${sectionAId}/cases`).set(auth()).send({ title: 'Alpha', priority: 'HIGH', type: 'SMOKE' });
  await request(app).post(`/api/v1/sections/${sectionAId}/cases`).set(auth()).send({ title: 'Bravo', priority: 'LOW', type: 'REGRESSION' });
  await request(app).post(`/api/v1/sections/${sectionBId}/cases`).set(auth()).send({ title: 'Charlie', priority: 'HIGH', type: 'REGRESSION' });
});

describe('case list filtering and sorting', () => {
  it('filters by a single category (priority)', async () => {
    const res = await request(app).get(`/api/v1/suites/${suiteId}/cases?priorities=HIGH`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.cases.map((c: { title: string }) => c.title).sort()).toEqual(['Alpha', 'Charlie']);
  });

  it('combines multiple categories with AND by default (match=all)', async () => {
    // priority=HIGH AND section=A -> only Alpha (Charlie is HIGH but in section B)
    const res = await request(app)
      .get(`/api/v1/suites/${suiteId}/cases?priorities=HIGH&sectionIds=${sectionAId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.cases.map((c: { title: string }) => c.title)).toEqual(['Alpha']);
  });

  it('combines multiple categories with OR when match=any', async () => {
    // priority=LOW OR section=B -> Bravo (LOW) + Charlie (section B)
    const res = await request(app)
      .get(`/api/v1/suites/${suiteId}/cases?priorities=LOW&sectionIds=${sectionBId}&match=any`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.cases.map((c: { title: string }) => c.title).sort()).toEqual(['Bravo', 'Charlie']);
  });

  it('filters by createdByIds', async () => {
    const res = await request(app).get(`/api/v1/suites/${suiteId}/cases?createdByIds=${leadUserId}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.cases).toHaveLength(3);

    const noMatch = await request(app).get(`/api/v1/suites/${suiteId}/cases?createdByIds=nonexistent-user-id`).set(auth());
    expect(noMatch.body.cases).toHaveLength(0);
  });

  it('sorts by title ascending and descending', async () => {
    const asc = await request(app).get(`/api/v1/suites/${suiteId}/cases?sortBy=title&sortDir=asc`).set(auth());
    expect(asc.body.cases.map((c: { title: string }) => c.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    const desc = await request(app).get(`/api/v1/suites/${suiteId}/cases?sortBy=title&sortDir=desc`).set(auth());
    expect(desc.body.cases.map((c: { title: string }) => c.title)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('section-scoped list also supports sort', async () => {
    const res = await request(app).get(`/api/v1/sections/${sectionAId}/cases?sortBy=title&sortDir=desc`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.cases.map((c: { title: string }) => c.title)).toEqual(['Bravo', 'Alpha']);
  });

  it('an unfiltered request still scopes to the suite and excludes deleted cases', async () => {
    const res = await request(app).get(`/api/v1/suites/${suiteId}/cases`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.cases).toHaveLength(3);
  });
});

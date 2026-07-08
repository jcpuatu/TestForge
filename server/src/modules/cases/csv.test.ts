import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'csv-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = login.body.accessToken;
});

describe('CSV import/export', () => {
  it('imports cases, auto-creating sections by name, and exports them back out losslessly', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'CSV Project' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(auth())
      .send({ name: 'Suite' });
    const suiteId = suite.body.suite.id;

    const csv = [
      'section,title,priority,type,preconditions,steps,expectedResult,referenceLink',
      'Login,Valid login succeeds,HIGH,SMOKE,User exists,Enter creds | Dashboard shown,User is logged in,',
      'Login,"Title, with a comma",MEDIUM,FUNCTIONAL,,,,',
    ].join('\n');

    const importRes = await request(app).post(`/api/v1/suites/${suiteId}/cases/import`).set(auth()).send({ csv });
    expect(importRes.status).toBe(201);
    expect(importRes.body.imported).toBe(2);

    const sections = await request(app).get(`/api/v1/suites/${suiteId}/sections`).set(auth());
    expect(sections.body.sections).toHaveLength(1);
    expect(sections.body.sections[0].name).toBe('Login');

    const cases = await request(app).get(`/api/v1/suites/${suiteId}/cases`).set(auth());
    expect(cases.body.cases).toHaveLength(2);
    const withSteps = cases.body.cases.find((c: { title: string }) => c.title === 'Valid login succeeds');
    expect(withSteps.steps).toEqual([{ step: 'Enter creds', expected: 'Dashboard shown' }]);
    const withComma = cases.body.cases.find((c: { title: string }) => c.title === 'Title, with a comma');
    expect(withComma).toBeTruthy();

    const exportRes = await request(app).get(`/api/v1/suites/${suiteId}/cases/export`).set(auth());
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.text).toContain('Valid login succeeds');
    expect(exportRes.text).toContain('"Title, with a comma"');
  });

  it('rejects a CSV missing the required title column', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'CSV Project 2' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(auth())
      .send({ name: 'Suite' });

    const res = await request(app)
      .post(`/api/v1/suites/${suite.body.suite.id}/cases/import`)
      .set(auth())
      .send({ csv: 'section,priority\nLogin,HIGH' });
    expect(res.status).toBe(400);
  });
});

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
    expect(withSteps.template).toBe('STEPS');
    const withComma = cases.body.cases.find((c: { title: string }) => c.title === 'Title, with a comma');
    expect(withComma).toBeTruthy();
    expect(withComma.template).toBe('TEXT');

    const exportRes = await request(app).get(`/api/v1/suites/${suiteId}/cases/export`).set(auth());
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.text).toContain('Valid login succeeds');
    expect(exportRes.text).toContain('"Title, with a comma"');
  });

  it('strips a leading UTF-8 BOM so the section column header still matches', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'CSV BOM Project' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(auth())
      .send({ name: 'Suite' });
    const suiteId = suite.body.suite.id;

    const csv =
      '﻿' +
      ['section,title,priority,type,preconditions,steps,expectedResult,referenceLink', 'Login,Valid login succeeds,HIGH,SMOKE,,,,'].join(
        '\n',
      );

    const importRes = await request(app).post(`/api/v1/suites/${suiteId}/cases/import`).set(auth()).send({ csv });
    expect(importRes.status).toBe(201);
    expect(importRes.body.imported).toBe(1);

    const sections = await request(app).get(`/api/v1/suites/${suiteId}/sections`).set(auth());
    expect(sections.body.sections).toHaveLength(1);
    expect(sections.body.sections[0].name).toBe('Login');
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

  it('auto-creates nested subsections from a Sections Hierarchy path, and export round-trips the same path', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'CSV Hierarchy Project' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(auth())
      .send({ name: 'Suite' });
    const suiteId = suite.body.suite.id;

    const csv = [
      'Sections Hierarchy,title,priority,type',
      'Auth > Login,Valid login succeeds,HIGH,SMOKE',
      'Auth > Login,Invalid password rejected,MEDIUM,FUNCTIONAL',
      'Auth > Logout,Logout clears session,MEDIUM,FUNCTIONAL',
    ].join('\n');

    const importRes = await request(app).post(`/api/v1/suites/${suiteId}/cases/import`).set(auth()).send({ csv });
    expect(importRes.status).toBe(201);
    expect(importRes.body.imported).toBe(3);

    const sections = await request(app).get(`/api/v1/suites/${suiteId}/sections`).set(auth());
    expect(sections.body.sections).toHaveLength(3);
    const auth_ = sections.body.sections.find((s: { name: string }) => s.name === 'Auth');
    const login = sections.body.sections.find((s: { name: string }) => s.name === 'Login');
    const logout = sections.body.sections.find((s: { name: string }) => s.name === 'Logout');
    expect(auth_.parentId).toBeNull();
    expect(login.parentId).toBe(auth_.id);
    expect(logout.parentId).toBe(auth_.id);

    const exportRes = await request(app).get(`/api/v1/suites/${suiteId}/cases/export`).set(auth());
    expect(exportRes.text).toContain('Sections Hierarchy');
    expect(exportRes.text).toContain('Auth > Login');
    expect(exportRes.text).toContain('Auth > Logout');
  });

  it('export honors a sectionIds filter and a columns picker', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'CSV Picker Project' });
    const suite = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/suites`)
      .set(auth())
      .send({ name: 'Suite' });
    const suiteId = suite.body.suite.id;

    const csv = ['section,title,priority,type', 'A,Case A,HIGH,SMOKE', 'B,Case B,LOW,REGRESSION'].join('\n');
    await request(app).post(`/api/v1/suites/${suiteId}/cases/import`).set(auth()).send({ csv });

    const sections = await request(app).get(`/api/v1/suites/${suiteId}/sections`).set(auth());
    const sectionA = sections.body.sections.find((s: { name: string }) => s.name === 'A');

    const filtered = await request(app)
      .get(`/api/v1/suites/${suiteId}/cases/export?sectionIds=${sectionA.id}&columns=title,priority`)
      .set(auth());
    expect(filtered.text).toContain('Case A');
    expect(filtered.text).not.toContain('Case B');
    expect(filtered.text.split('\r\n')[0]).toBe('title,priority');
  });

  // Regression tests: CSV import built its case rows directly from raw cell text with none of
  // createCaseSchema's validation — a blank title cell silently created a titleless case, and a
  // row shorter than the header (title column landing on `undefined`) either did the same or,
  // depending on which column the shortfall hit, 500'd instead of failing cleanly.
  describe('validates rows the way the JSON API does', () => {
    async function importCsv(csv: string) {
      const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `CSV Validation ${Date.now()}-${Math.random()}` });
      const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(auth()).send({ name: 'Suite' });
      return request(app).post(`/api/v1/suites/${suite.body.suite.id}/cases/import`).set(auth()).send({ csv });
    }

    it('rejects a blank title cell instead of silently creating a titleless case', async () => {
      const res = await importCsv('title,priority\n,HIGH');
      expect(res.status).toBe(400);
    });

    it('rejects a row shorter than the header that leaves title undefined', async () => {
      const res = await importCsv('foo,title\nonly-one-value');
      expect(res.status).toBe(400);
    });

    it('rejects a title over 300 characters', async () => {
      const res = await importCsv(`title\n${'x'.repeat(301)}`);
      expect(res.status).toBe(400);
    });
  });
});

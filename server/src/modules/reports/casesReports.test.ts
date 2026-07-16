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
    data: { email: 'cases-reports-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
});

async function seedProjectWithCases() {
  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Cases Reports ${Date.now()}-${Math.random()}` });
  const projectId = project.body.project.id as string;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
  const suiteId = suite.body.suite.id as string;
  const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Section A' });
  const sectionId = section.body.section.id as string;

  const caseHigh = await request(app)
    .post(`/api/v1/sections/${sectionId}/cases`)
    .set(auth())
    .send({ title: 'High priority case', priority: 'HIGH', type: 'SMOKE', referenceLink: 'TRM-1, TRM-2' });
  const caseLow = await request(app)
    .post(`/api/v1/sections/${sectionId}/cases`)
    .set(auth())
    .send({ title: 'Low priority case', priority: 'LOW', type: 'REGRESSION' });
  const caseMedium = await request(app)
    .post(`/api/v1/sections/${sectionId}/cases`)
    .set(auth())
    .send({ title: 'Medium priority case', priority: 'MEDIUM', type: 'FUNCTIONAL', referenceLink: 'TRM-1' });

  return { projectId, suiteId, sectionId, caseHigh: caseHigh.body.case, caseLow: caseLow.body.case, caseMedium: caseMedium.body.case };
}

describe('Cases Reports', () => {
  describe('Activity Summary', () => {
    it('counts cases created within the default (this week) range', async () => {
      const { projectId } = await seedProjectWithCases();
      const res = await request(app).get(`/api/v1/projects/${projectId}/reports/cases/activity-summary`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.newCount).toBe(3);
      expect(res.body.series.length).toBeGreaterThan(0);
    });

    it('groups by section when requested', async () => {
      const { projectId, sectionId } = await seedProjectWithCases();
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/reports/cases/activity-summary?groupBy=section`)
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.groups).toEqual([expect.objectContaining({ sectionId, sectionName: 'Section A', created: 3 })]);
    });

    it('excludes new cases when includeNew=false', async () => {
      const { projectId } = await seedProjectWithCases();
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/reports/cases/activity-summary?includeNew=false`)
        .set(auth());
      expect(res.body.newCount).toBe(0);
    });
  });

  describe('Coverage for References', () => {
    it('splits cases into covered/uncovered and groups covered cases by reference', async () => {
      const { projectId } = await seedProjectWithCases();
      const res = await request(app).get(`/api/v1/projects/${projectId}/reports/cases/coverage-for-references`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.coveredCount).toBe(2);
      expect(res.body.uncoveredCount).toBe(1);
      const trm1 = res.body.references.find((r: { reference: string }) => r.reference === 'TRM-1');
      expect(trm1.cases).toHaveLength(2);
      const trm2 = res.body.references.find((r: { reference: string }) => r.reference === 'TRM-2');
      expect(trm2.cases).toHaveLength(1);
    });

    it('filters to only the specified reference IDs when provided', async () => {
      const { projectId } = await seedProjectWithCases();
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/reports/cases/coverage-for-references?referenceIds=TRM-2`)
        .set(auth());
      expect(res.body.references).toEqual([expect.objectContaining({ reference: 'TRM-2' })]);
    });
  });

  describe('Property Distribution', () => {
    it('groups cases by priority by default', async () => {
      const { projectId } = await seedProjectWithCases();
      const res = await request(app).get(`/api/v1/projects/${projectId}/reports/cases/property-distribution`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.buckets).toEqual(
        expect.arrayContaining([
          { value: 'HIGH', count: 1, percent: 1 / 3 },
          { value: 'LOW', count: 1, percent: 1 / 3 },
          { value: 'MEDIUM', count: 1, percent: 1 / 3 },
        ]),
      );
    });

    it('groups by type when requested', async () => {
      const { projectId } = await seedProjectWithCases();
      const res = await request(app).get(`/api/v1/projects/${projectId}/reports/cases/property-distribution?groupBy=type`).set(auth());
      expect(res.body.groupBy).toBe('type');
      expect(res.body.buckets.map((b: { value: string }) => b.value).sort()).toEqual(['FUNCTIONAL', 'REGRESSION', 'SMOKE']);
    });
  });

  describe('Status Tops', () => {
    it('groups tests by latest status across selected runs', async () => {
      const { projectId, suiteId, caseHigh, caseLow } = await seedProjectWithCases();
      const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: 'Run 1', suiteId });
      const runId = run.body.run.id as string;
      const tests = await request(app).get(`/api/v1/runs/${runId}/tests`).set(auth());
      const testForHigh = tests.body.tests.find((t: { caseId: string }) => t.caseId === caseHigh.id);
      const testForLow = tests.body.tests.find((t: { caseId: string }) => t.caseId === caseLow.id);

      await request(app).post(`/api/v1/tests/${testForHigh.id}/results`).set(auth()).send({ status: 'PASSED' });
      await request(app).post(`/api/v1/tests/${testForLow.id}/results`).set(auth()).send({ status: 'FAILED' });

      const res = await request(app).get(`/api/v1/projects/${projectId}/reports/cases/status-tops?runIds=${runId}`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.buckets).toEqual(
        expect.arrayContaining([
          { value: 'PASSED', count: 1, percent: 1 / 3 },
          { value: 'FAILED', count: 1, percent: 1 / 3 },
          { value: 'UNTESTED', count: 1, percent: 1 / 3 },
        ]),
      );
    });

    it('defaults to the 25 most recent runs when no runIds given', async () => {
      const { projectId, suiteId } = await seedProjectWithCases();
      const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: 'Run 2', suiteId });
      const res = await request(app).get(`/api/v1/projects/${projectId}/reports/cases/status-tops`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.runs.map((r: { id: string }) => r.id)).toContain(run.body.run.id);
    });

    // Regression test: `latestOnly` (the default) previously kept the OLDEST RunCase per case,
    // not the newest — `new Map(pairs)` keeps the LAST occurrence of a duplicate key, but the
    // source array is sorted newest-first, so "last occurrence" was actually the oldest row.
    // A case that appears in two selected runs, with a different (and later) result in the
    // second run, must report the second run's status — the whole point of "latest."
    it('reports the status from the most recently updated run when the same case appears in multiple selected runs', async () => {
      const { projectId, suiteId, caseHigh } = await seedProjectWithCases();

      const runOlder = await request(app)
        .post(`/api/v1/projects/${projectId}/runs`)
        .set(auth())
        .send({ name: 'Older Run', suiteId, caseIds: [caseHigh.id] });
      const olderTests = await request(app).get(`/api/v1/runs/${runOlder.body.run.id}/tests`).set(auth());
      await request(app).post(`/api/v1/tests/${olderTests.body.tests[0].id}/results`).set(auth()).send({ status: 'FAILED' });

      const runNewer = await request(app)
        .post(`/api/v1/projects/${projectId}/runs`)
        .set(auth())
        .send({ name: 'Newer Run', suiteId, caseIds: [caseHigh.id] });
      const newerTests = await request(app).get(`/api/v1/runs/${runNewer.body.run.id}/tests`).set(auth());
      await request(app).post(`/api/v1/tests/${newerTests.body.tests[0].id}/results`).set(auth()).send({ status: 'PASSED' });

      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/reports/cases/status-tops?runIds=${runOlder.body.run.id},${runNewer.body.run.id}`)
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.latestOnly).toBe(true);
      const caseRow = res.body.cases.find((c: { caseId: string }) => c.caseId === caseHigh.id);
      expect(caseRow.status).toBe('PASSED');
      expect(caseRow.runId).toBe(runNewer.body.run.id);
    });
  });
});

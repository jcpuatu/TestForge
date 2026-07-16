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
    data: { email: 'run-scoped-reports-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
});

async function seed() {
  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Run Scoped Reports ${Date.now()}-${Math.random()}` });
  const projectId = project.body.project.id as string;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
  const suiteId = suite.body.suite.id as string;
  const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Section' });
  const sectionId = section.body.section.id as string;

  const caseA = await request(app)
    .post(`/api/v1/sections/${sectionId}/cases`)
    .set(auth())
    .send({ title: 'Case A', priority: 'HIGH', referenceLink: 'TRM-1' });
  const caseB = await request(app).post(`/api/v1/sections/${sectionId}/cases`).set(auth()).send({ title: 'Case B', priority: 'LOW' });

  const run1 = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: 'Run 1', suiteId });
  const run2 = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: 'Run 2', suiteId });
  const run1Id = run1.body.run.id as string;
  const run2Id = run2.body.run.id as string;

  const run1Tests = (await request(app).get(`/api/v1/runs/${run1Id}/tests`).set(auth())).body.tests;
  const run2Tests = (await request(app).get(`/api/v1/runs/${run2Id}/tests`).set(auth())).body.tests;
  const testFor = (tests: { id: string; caseId: string }[], caseId: string) => tests.find((t) => t.caseId === caseId)!.id;

  // Case A: fails in Run 1 (logging BUG-1), passes in Run 2 with the same defect ID retained
  // (simulating "retested after fix, defect kept for traceability").
  await request(app).post(`/api/v1/tests/${testFor(run1Tests, caseA.body.case.id)}/results`).set(auth()).send({ status: 'FAILED', defects: 'BUG-1' });
  await request(app).post(`/api/v1/tests/${testFor(run2Tests, caseA.body.case.id)}/results`).set(auth()).send({ status: 'PASSED', defects: 'BUG-1' });
  // Case B: passes in Run 1, left untested in Run 2, never has a defect logged.
  await request(app).post(`/api/v1/tests/${testFor(run1Tests, caseB.body.case.id)}/results`).set(auth()).send({ status: 'PASSED' });

  return { projectId, run1Id, run2Id, caseAId: caseA.body.case.id as string, caseBId: caseB.body.case.id as string };
}

describe('Defects Reports (run-scoped)', () => {
  it('Summary aggregates a defect ID across the selected runs with open/resolved counts', async () => {
    const { projectId, run1Id, run2Id } = await seed();
    const res = await request(app).get(`/api/v1/projects/${projectId}/reports/defects/summary?runIds=${run1Id},${run2Id}`).set(auth());
    expect(res.status).toBe(200);
    const bug1 = res.body.defects.find((d: { id: string }) => d.id === 'BUG-1');
    expect(bug1.count).toBe(2);
    expect(bug1.openCount).toBe(1);
    expect(bug1.resolvedCount).toBe(1);
  });

  // Regression test: defect IDs were grouped by the raw string, so "BUG-1" and "bug-1" (a real,
  // ordinary scenario — one tester types it, another pastes it from an issue tracker with
  // different casing) fragmented into two unrelated-looking defect rows instead of one.
  it('groups defect IDs case-insensitively, keeping the first-seen casing for display', async () => {
    const { projectId, run1Id, run2Id, caseBId } = await seed();
    const run2Tests = (await request(app).get(`/api/v1/runs/${run2Id}/tests`).set(auth())).body.tests;
    const testForCaseB = run2Tests.find((t: { caseId: string }) => t.caseId === caseBId).id;
    await request(app).post(`/api/v1/tests/${testForCaseB}/results`).set(auth()).send({ status: 'FAILED', defects: 'bug-1' });

    const res = await request(app).get(`/api/v1/projects/${projectId}/reports/defects/summary?runIds=${run1Id},${run2Id}`).set(auth());
    expect(res.status).toBe(200);
    const bug1Rows = res.body.defects.filter((d: { id: string }) => d.id.toUpperCase() === 'BUG-1');
    expect(bug1Rows).toHaveLength(1);
    expect(bug1Rows[0].id).toBe('BUG-1'); // first-seen casing, from seed()'s own "BUG-1" mentions
    // 3 mentions total: Case A/Run1 ("BUG-1"), Case A/Run2 ("BUG-1"), Case B/Run2 ("bug-1", added above)
    expect(bug1Rows[0].count).toBe(3);
  });

  // Regression test: the cross-result case-insensitive grouping fix above didn't cover this
  // case — a SINGLE result's defects field containing multiple casings of the same logical ID
  // (e.g. a tester typing "bug-100, BUG-100, Bug-100") survived parseReferences's exact-string
  // dedup as 3 distinct entries, each independently incrementing count/openCount for what's
  // really one failing test mentioning one defect once.
  it('does not multiply-count multiple casings of the same defect ID within a single result', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Same Result Dedup ${Date.now()}` });
    const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(auth()).send({ name: 'Suite' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth()).send({ name: 'Section' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Case' });
    const run = await request(app).post(`/api/v1/projects/${project.body.project.id}/runs`).set(auth()).send({ name: 'Run', suiteId: suite.body.suite.id });
    const tests = (await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth())).body.tests;
    await request(app)
      .post(`/api/v1/tests/${tests[0].id}/results`)
      .set(auth())
      .send({ status: 'FAILED', defects: 'bug-100, BUG-100, Bug-100' });

    const res = await request(app).get(`/api/v1/projects/${project.body.project.id}/reports/defects/summary?runIds=${run.body.run.id}`).set(auth());
    expect(res.status).toBe(200);
    const bug100 = res.body.defects.find((d: { id: string }) => d.id.toUpperCase() === 'BUG-100');
    expect(bug100.count).toBe(1);
    expect(bug100.openCount).toBe(1);
    expect(bug100.cases).toHaveLength(1);
  });

  it('Summary for Cases shows only cases with a defect somewhere in the matrix, with per-run cells', async () => {
    const { projectId, run1Id, run2Id, caseAId, caseBId } = await seed();
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/reports/defects/summary-for-cases?runIds=${run1Id},${run2Id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.cases.map((c: { caseId: string }) => c.caseId)).toEqual([caseAId]);
    expect(res.body.cases.find((c: { caseId: string }) => c.caseId === caseBId)).toBeUndefined();
    const caseARow = res.body.cases[0];
    const run1Cell = caseARow.cells.find((c: { runId: string }) => c.runId === run1Id);
    const run2Cell = caseARow.cells.find((c: { runId: string }) => c.runId === run2Id);
    expect(run1Cell).toEqual({ runId: run1Id, status: 'FAILED', defects: ['BUG-1'] });
    expect(run2Cell).toEqual({ runId: run2Id, status: 'PASSED', defects: ['BUG-1'] });
  });

  it('Summary for References groups defect-bearing cases by reference, excluding referenceless cases', async () => {
    const { projectId, run1Id, run2Id, caseAId } = await seed();
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/reports/defects/summary-for-references?runIds=${run1Id},${run2Id}`)
      .set(auth());
    expect(res.status).toBe(200);
    const trm1 = res.body.references.find((r: { reference: string }) => r.reference === 'TRM-1');
    expect(trm1.cases.map((c: { caseId: string }) => c.caseId)).toEqual([caseAId]);
  });
});

describe('Results Reports (run-scoped)', () => {
  it('Comparison for Cases shows every case with a status cell per run', async () => {
    const { projectId, run1Id, run2Id, caseAId, caseBId } = await seed();
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/reports/results/comparison-for-cases?runIds=${run1Id},${run2Id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.cases).toHaveLength(2);
    const caseA = res.body.cases.find((c: { caseId: string }) => c.caseId === caseAId);
    expect(caseA.cells.find((c: { runId: string }) => c.runId === run1Id).status).toBe('FAILED');
    expect(caseA.cells.find((c: { runId: string }) => c.runId === run2Id).status).toBe('PASSED');
    const caseB = res.body.cases.find((c: { caseId: string }) => c.caseId === caseBId);
    expect(caseB.cells.find((c: { runId: string }) => c.runId === run1Id).status).toBe('PASSED');
    expect(caseB.cells.find((c: { runId: string }) => c.runId === run2Id).status).toBe('UNTESTED');
  });

  it('Comparison for References groups only referenced cases', async () => {
    const { projectId, run1Id, run2Id, caseAId } = await seed();
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/reports/results/comparison-for-references?runIds=${run1Id},${run2Id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.references).toEqual([expect.objectContaining({ reference: 'TRM-1' })]);
    expect(res.body.references[0].cases.map((c: { caseId: string }) => c.caseId)).toEqual([caseAId]);
  });

  // Regression test for the reason RunCase.referenceLinkSnapshot exists at all: Comparison for
  // References previously read TestCase.referenceLink LIVE via the case join, so editing a
  // case's reference after a run already had results retroactively moved that run's history
  // into the new bucket — silently contradicting this app's own stated principle that editing
  // or deleting a case must never corrupt historical run results (see root/server CLAUDE.md).
  it('keeps a run grouped under its original reference after the case\'s reference is edited', async () => {
    const { projectId, run1Id, run2Id, caseAId } = await seed();
    await request(app).patch(`/api/v1/cases/${caseAId}`).set(auth()).send({ referenceLink: 'TRM-CHANGED-LATER' });

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/reports/results/comparison-for-references?runIds=${run1Id},${run2Id}`)
      .set(auth());
    expect(res.status).toBe(200);
    // The historical run data must stay under the ORIGINAL reference, not the case's new one.
    expect(res.body.references.map((r: { reference: string }) => r.reference)).toContain('TRM-1');
    expect(res.body.references.map((r: { reference: string }) => r.reference)).not.toContain('TRM-CHANGED-LATER');
    const trm1 = res.body.references.find((r: { reference: string }) => r.reference === 'TRM-1');
    expect(trm1.cases.map((c: { caseId: string }) => c.caseId)).toEqual([caseAId]);
  });

  it('Property Distribution groups tests by status across the selected runs by default', async () => {
    const { projectId, run1Id, run2Id } = await seed();
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/reports/results/property-distribution?runIds=${run1Id},${run2Id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(res.body.buckets).toEqual(
      expect.arrayContaining([
        { value: 'FAILED', count: 1, percent: 0.25 },
        { value: 'PASSED', count: 2, percent: 0.5 },
        { value: 'UNTESTED', count: 1, percent: 0.25 },
      ]),
    );
  });

  // Regression test: grouping by assignedTo previously keyed on the display NAME, not the user
  // id — two different users who happen to share a name were silently merged into one bucket.
  // This codebase already has the correct id-then-resolve-to-name pattern one file over
  // (GET /me/workload); this report should match it.
  it('Property Distribution groups by assignedTo using user id, not display name, so same-named users stay separate', async () => {
    const { projectId, run1Id } = await seed();
    const userA = await request(app)
      .post('/api/v1/users')
      .set(auth())
      .send({ email: `dup-a-${Date.now()}@example.com`, name: 'QA Auditor Dup', role: 'TESTER', password: 'TesterPass123!' });
    const userB = await request(app)
      .post('/api/v1/users')
      .set(auth())
      .send({ email: `dup-b-${Date.now()}@example.com`, name: 'QA Auditor Dup', role: 'TESTER', password: 'TesterPass123!' });
    const run1Tests = (await request(app).get(`/api/v1/runs/${run1Id}/tests`).set(auth())).body.tests;
    await request(app)
      .post(`/api/v1/runs/${run1Id}/tests/bulk-assign`)
      .set(auth())
      .send({ testIds: [run1Tests[0].id], assignedToId: userA.body.user.id });
    await request(app)
      .post(`/api/v1/runs/${run1Id}/tests/bulk-assign`)
      .set(auth())
      .send({ testIds: [run1Tests[1].id], assignedToId: userB.body.user.id });

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/reports/results/property-distribution?runIds=${run1Id}&groupBy=assignedTo`)
      .set(auth());
    expect(res.status).toBe(200);
    // If grouping were still keyed on display name (the bug), userA and userB's one test each
    // would merge into a single { value: 'QA Auditor Dup', count: 2 } bucket. Grouped correctly
    // by id, they stay as two separate buckets that both happen to display the same name.
    const dupBuckets = res.body.buckets.filter((b: { value: string }) => b.value === 'QA Auditor Dup');
    expect(dupBuckets).toHaveLength(2);
    expect(dupBuckets).toEqual([
      { value: 'QA Auditor Dup', count: 1, percent: 0.5 },
      { value: 'QA Auditor Dup', count: 1, percent: 0.5 },
    ]);
  });
});

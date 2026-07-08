import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let projectId: string;
let suiteId: string;

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

async function seedRunWithTwoCases(runName: string) {
  const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: `Sec-${runName}` });
  await request(app)
    .post(`/api/v1/sections/${section.body.section.id}/cases`)
    .set(auth())
    .send({ title: 'Case A', priority: 'HIGH', steps: [{ step: 'Do X', expected: 'Y happens' }] });
  await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Case B', priority: 'LOW' });
  const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: runName, suiteId });
  const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth());
  return { run: run.body.run, tests: tests.body.tests };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'defects-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;

  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'Defects Project' });
  projectId = project.body.project.id;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
  suiteId = suite.body.suite.id;
});

describe('latestDefects on run tests', () => {
  it('exposes the latest result comment/defects on each test row', async () => {
    const { tests } = await seedRunWithTwoCases('Run Latest');
    await request(app)
      .post(`/api/v1/tests/${tests[0].id}/results`)
      .set(auth())
      .send({ status: 'FAILED', comment: 'broke', defects: 'BUG-1' });

    const refreshed = await request(app).get(`/api/v1/runs/${(await request(app).get(`/api/v1/tests/${tests[0].id}`).set(auth())).body.test.runId}/tests`).set(auth());
    const row = refreshed.body.tests.find((t: { id: string }) => t.id === tests[0].id);
    expect(row.latestDefects).toBe('BUG-1');
    expect(row.latestComment).toBe('broke');

    const untouched = refreshed.body.tests.find((t: { id: string }) => t.id === tests[1].id);
    expect(untouched.latestDefects).toBeNull();
  });

  it('reflects only the most recent result, not older ones', async () => {
    const { tests } = await seedRunWithTwoCases('Run Latest 2');
    await request(app).post(`/api/v1/tests/${tests[0].id}/results`).set(auth()).send({ status: 'FAILED', defects: 'BUG-OLD' });
    await request(app).post(`/api/v1/tests/${tests[0].id}/results`).set(auth()).send({ status: 'PASSED', defects: 'BUG-NEW' });

    const runId = (await request(app).get(`/api/v1/tests/${tests[0].id}`).set(auth())).body.test.runId;
    const refreshed = await request(app).get(`/api/v1/runs/${runId}/tests`).set(auth());
    const row = refreshed.body.tests.find((t: { id: string }) => t.id === tests[0].id);
    expect(row.latestDefects).toBe('BUG-NEW');
    expect(row.status).toBe('PASSED');
  });
});

describe('run reopen', () => {
  it('flips isCompleted back to false', async () => {
    const { run } = await seedRunWithTwoCases('Run Reopen');
    await request(app).post(`/api/v1/runs/${run.id}/close`).set(auth());
    const closed = await request(app).get(`/api/v1/runs/${run.id}`).set(auth());
    expect(closed.body.run.isCompleted).toBe(true);

    const reopened = await request(app).post(`/api/v1/runs/${run.id}/reopen`).set(auth());
    expect(reopened.status).toBe(200);
    expect(reopened.body.run.isCompleted).toBe(false);
    expect(reopened.body.run.completedAt).toBeNull();
  });
});

describe('defects rollup', () => {
  it('aggregates defect ids across cases with open/resolved counts', async () => {
    const { tests: testsA } = await seedRunWithTwoCases('Run Rollup A');
    const { tests: testsB } = await seedRunWithTwoCases('Run Rollup B');

    await request(app).post(`/api/v1/tests/${testsA[0].id}/results`).set(auth()).send({ status: 'FAILED', defects: 'BUG-500' });
    await request(app).post(`/api/v1/tests/${testsB[0].id}/results`).set(auth()).send({ status: 'FAILED', defects: 'BUG-500' });
    await request(app).post(`/api/v1/tests/${testsA[1].id}/results`).set(auth()).send({ status: 'PASSED', defects: 'BUG-500' });

    const rollup = await request(app).get(`/api/v1/projects/${projectId}/defects`).set(auth());
    expect(rollup.status).toBe(200);
    const bug500 = rollup.body.defects.find((d: { id: string }) => d.id === 'BUG-500');
    expect(bug500.count).toBe(3);
    expect(bug500.openCount).toBe(2);
    expect(bug500.resolvedCount).toBe(1);
  });

  it('splits comma-separated defect ids into separate entries', async () => {
    const { tests } = await seedRunWithTwoCases('Run Rollup Multi');
    await request(app).post(`/api/v1/tests/${tests[0].id}/results`).set(auth()).send({ status: 'FAILED', defects: 'BUG-600, BUG-601' });

    const rollup = await request(app).get(`/api/v1/projects/${projectId}/defects`).set(auth());
    expect(rollup.body.defects.some((d: { id: string }) => d.id === 'BUG-600')).toBe(true);
    expect(rollup.body.defects.some((d: { id: string }) => d.id === 'BUG-601')).toBe(true);
  });
});

describe('defects CSV export', () => {
  it('exports only failed/blocked tests in Jira-import-shaped columns', async () => {
    const { run, tests } = await seedRunWithTwoCases('Run Export');
    await request(app)
      .post(`/api/v1/tests/${tests[0].id}/results`)
      .set(auth())
      .send({ status: 'FAILED', comment: 'it broke', defects: 'BUG-700' });

    const res = await request(app).get(`/api/v1/runs/${run.id}/defects/export`).set(auth());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Summary,Description,Issue Type,Priority,Labels');
    expect(res.text).toContain('Case A');
    expect(res.text).toContain('Do X');
    expect(res.text).toContain('it broke');
    expect(res.text).not.toContain('Case B'); // Case B was never failed, shouldn't be exported
  });
});

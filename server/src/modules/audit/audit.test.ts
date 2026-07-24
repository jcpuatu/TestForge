import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'audit-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
});

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

async function seedProject() {
  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Audit ${Date.now()}-${Math.random()}` });
  return project.body.project.id as string;
}

async function feed(projectId: string) {
  return request(app).get(`/api/v1/projects/${projectId}/audit-log`).set(auth());
}

describe('audit log', () => {
  it('logs label rename and delete', async () => {
    const projectId = await seedProject();
    const label = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth()).send({ name: 'Smoke' });
    await request(app).patch(`/api/v1/labels/${label.body.label.id}`).set(auth()).send({ name: 'Smoke Test' });
    await request(app).delete(`/api/v1/labels/${label.body.label.id}`).set(auth());

    const res = await feed(projectId);
    const actions = res.body.entries.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['LABEL_RENAMED', 'LABEL_DELETED']));
    expect(res.body.entries[0].actor.name).toBe('Admin');
  });

  it('logs suite, section, and case deletion', async () => {
    const projectId = await seedProject();
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth()).send({ name: 'Section' });
    const testCase = await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Case' });

    await request(app).delete(`/api/v1/cases/${testCase.body.case.id}`).set(auth());
    await request(app).delete(`/api/v1/sections/${section.body.section.id}`).set(auth());

    const res = await feed(projectId);
    const actions = res.body.entries.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['CASE_DELETED', 'SECTION_DELETED']));
  });

  it('logs milestone/plan/run date changes and run close', async () => {
    const projectId = await seedProject();
    const milestone = await request(app).post(`/api/v1/projects/${projectId}/milestones`).set(auth()).send({ name: 'M1' });
    await request(app).patch(`/api/v1/milestones/${milestone.body.milestone.id}`).set(auth()).send({ dueDate: '2026-06-01T00:00:00.000Z' });

    const plan = await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth()).send({ name: 'Plan' });
    await request(app).patch(`/api/v1/plans/${plan.body.plan.id}`).set(auth()).send({ startDate: '2026-06-01T00:00:00.000Z' });

    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth()).send({ name: 'Section' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Case' });
    const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: 'Run', suiteId: suite.body.suite.id });
    await request(app).patch(`/api/v1/runs/${run.body.run.id}`).set(auth()).send({ endDate: '2026-06-01T00:00:00.000Z' });
    await request(app).post(`/api/v1/runs/${run.body.run.id}/close`).set(auth());

    const res = await feed(projectId);
    const actions = res.body.entries.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['MILESTONE_DATES_CHANGED', 'PLAN_DATES_CHANGED', 'RUN_DATES_CHANGED', 'RUN_CLOSED']),
    );
  });

  it('does not log a PATCH that only changes non-date fields', async () => {
    const projectId = await seedProject();
    const plan = await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth()).send({ name: 'Plan' });
    await request(app).patch(`/api/v1/plans/${plan.body.plan.id}`).set(auth()).send({ name: 'Renamed Plan' });

    const res = await feed(projectId);
    expect(res.body.entries).toHaveLength(0);
  });

  // Regression test: this endpoint had a hard `take: 200` with no `skip` -- a long-lived active
  // project eventually exceeds 200 logged actions, and everything before that was permanently
  // unreachable through this endpoint.
  it('paginates via real skip/take instead of a fixed cap', async () => {
    const projectId = await seedProject();
    for (const name of ['Label A', 'Label B']) {
      const label = await request(app).post(`/api/v1/projects/${projectId}/labels`).set(auth()).send({ name });
      await request(app).delete(`/api/v1/labels/${label.body.label.id}`).set(auth());
    }
    // 2 labels x (create is unlogged, delete is logged) = 2 entries; renaming isn't needed here,
    // just need >1 entries to prove skip/take actually moves the window.
    const page1 = await request(app).get(`/api/v1/projects/${projectId}/audit-log?page=1&pageSize=1`).set(auth());
    expect(page1.body.entries).toHaveLength(1);
    expect(page1.body).toMatchObject({ total: 2, page: 1, pageSize: 1, hasMore: true });

    const page2 = await request(app).get(`/api/v1/projects/${projectId}/audit-log?page=2&pageSize=1`).set(auth());
    expect(page2.body.entries).toHaveLength(1);
    expect(page2.body.hasMore).toBe(false);
    expect(page2.body.entries[0].id).not.toBe(page1.body.entries[0].id);
  });
});

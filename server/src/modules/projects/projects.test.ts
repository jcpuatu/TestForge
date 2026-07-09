import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let leadToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'project-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  await prisma.user.create({
    data: { email: 'project-lead@example.com', name: 'Lead', role: 'LEAD', passwordHash: await hashPassword('LeadPass123!') },
  });

  const adminLogin = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = adminLogin.body.accessToken;
  const leadLogin = await request(app).post('/api/v1/auth/login').send({ email: 'project-lead@example.com', password: 'LeadPass123!' });
  leadToken = leadLogin.body.accessToken;
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('project update/delete', () => {
  it('renames a project', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Old Project Name' });
    const renamed = await request(app)
      .patch(`/api/v1/projects/${project.body.project.id}`)
      .set(auth(adminToken))
      .send({ name: 'New Project Name' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.project.name).toBe('New Project Name');
  });

  it('delete-impact reports counts across the whole project', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Impact Project' });
    const projectId = project.body.project.id;
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite' });
    const section = await request(app)
      .post(`/api/v1/suites/${suite.body.suite.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'Section' });
    await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth(adminToken)).send({ title: 'Case' });
    await request(app)
      .post(`/api/v1/projects/${projectId}/runs`)
      .set(auth(adminToken))
      .send({ name: 'Run', suiteId: suite.body.suite.id });
    await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth(adminToken)).send({ name: 'Plan' });
    await request(app).post(`/api/v1/projects/${projectId}/milestones`).set(auth(adminToken)).send({ name: 'Milestone' });

    const impact = await request(app).get(`/api/v1/projects/${projectId}/delete-impact`).set(auth(adminToken));
    expect(impact.status).toBe(200);
    expect(impact.body).toEqual({ suiteCount: 1, caseCount: 1, runCount: 1, planCount: 1, milestoneCount: 1 });
  });

  it('rejects a LEAD deleting a project (ADMIN only)', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Admin Only Delete' });
    const res = await request(app).delete(`/api/v1/projects/${project.body.project.id}`).set(auth(leadToken));
    expect(res.status).toBe(403);
  });

  it('deletes a project and cascades to everything within it', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Full Delete Project' });
    const projectId = project.body.project.id;
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite' });

    const del = await request(app).delete(`/api/v1/projects/${projectId}`).set(auth(adminToken));
    expect(del.status).toBe(204);

    const dbSuite = await prisma.suite.findUnique({ where: { id: suite.body.suite.id } });
    expect(dbSuite).toBeNull();
  });

  // Regression test: Section and Milestone both self-relate via parentId with onDelete:
  // Restrict. Cascading Project -> Suite -> Section (or Project -> Milestone) has no
  // guaranteed child-before-parent order, so a project with nested sections/milestones used
  // to throw a raw Prisma FK error (a generic 500) — caught via live browser testing, not by
  // the simpler cascade test above.
  it('deletes a project containing nested sections and nested milestones without a foreign-key error', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: 'Nested Delete Project' });
    const projectId = project.body.project.id;
    const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite' });
    const parentSection = await request(app)
      .post(`/api/v1/suites/${suite.body.suite.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'Parent Section' });
    await request(app)
      .post(`/api/v1/suites/${suite.body.suite.id}/sections`)
      .set(auth(adminToken))
      .send({ name: 'Child Section', parentId: parentSection.body.section.id });

    const parentMilestone = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth(adminToken))
      .send({ name: 'Parent Milestone' });
    await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth(adminToken))
      .send({ name: 'Child Milestone', parentId: parentMilestone.body.milestone.id });

    const del = await request(app).delete(`/api/v1/projects/${projectId}`).set(auth(adminToken));
    expect(del.status).toBe(204);
  });
});

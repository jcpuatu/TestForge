import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let projectId: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'milestone-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = login.body.accessToken;

  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'Milestone Project' });
  projectId = project.body.project.id;
});

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

describe('milestones', () => {
  it('creates, lists, and completes a milestone', async () => {
    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth())
      .send({ name: 'Release 1.0', dueDate: '2026-08-01T00:00:00.000Z' });
    expect(created.status).toBe(201);
    const id = created.body.milestone.id;

    const list = await request(app).get(`/api/v1/projects/${projectId}/milestones`).set(auth());
    expect(list.body.milestones).toHaveLength(1);

    const completed = await request(app).patch(`/api/v1/milestones/${id}`).set(auth()).send({ isCompleted: true });
    expect(completed.body.milestone.isCompleted).toBe(true);
    expect(completed.body.milestone.completedAt).not.toBeNull();
  });

  it('reparents child milestones instead of orphaning them on delete', async () => {
    const parent = await request(app).post(`/api/v1/projects/${projectId}/milestones`).set(auth()).send({ name: 'Parent' });
    const child = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth())
      .send({ name: 'Child', parentId: parent.body.milestone.id });

    const del = await request(app).delete(`/api/v1/milestones/${parent.body.milestone.id}`).set(auth());
    expect(del.status).toBe(204);

    const refetched = await request(app).get(`/api/v1/milestones/${child.body.milestone.id}`).set(auth());
    expect(refetched.body.milestone.parentId).toBeNull();
  });

  // Regression test: the existing "reparents on delete" test above only exercises a 2-level
  // chain (deleting the root parent, whose own parentId is already null) — deleting a MIDDLE
  // node of a real 3-level chain needs the child to pick up the deleted node's actual parent
  // (the grandparent), not just null.
  it('reparents to the grandparent, not null, when deleting a middle node of a 3-level chain', async () => {
    const grandparent = await request(app).post(`/api/v1/projects/${projectId}/milestones`).set(auth()).send({ name: 'Grandparent' });
    const middle = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth())
      .send({ name: 'Middle', parentId: grandparent.body.milestone.id });
    const child = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth())
      .send({ name: 'Child', parentId: middle.body.milestone.id });

    await request(app).delete(`/api/v1/milestones/${middle.body.milestone.id}`).set(auth());

    const refetched = await request(app).get(`/api/v1/milestones/${child.body.milestone.id}`).set(auth());
    expect(refetched.body.milestone.parentId).toBe(grandparent.body.milestone.id);
  });

  // Regression test: a nonexistent parentId 500'd (unhandled Prisma FK error), and a parentId
  // from a DIFFERENT project silently succeeded, creating a milestone that would never appear in
  // its own project's tree (buildTree only walks nodes present in that project's own fetched list).
  it('rejects a parentId that does not exist or belongs to a different project', async () => {
    const missing = await request(app).post(`/api/v1/projects/${projectId}/milestones`).set(auth()).send({ name: 'X', parentId: 'nonexistent-id' });
    expect(missing.status).toBe(404);

    const otherProject = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Other Milestone Project ${Date.now()}` });
    const foreignParent = await request(app)
      .post(`/api/v1/projects/${otherProject.body.project.id}/milestones`)
      .set(auth())
      .send({ name: 'Foreign Parent' });
    const crossProject = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth())
      .send({ name: 'Cross Project Child', parentId: foreignParent.body.milestone.id });
    expect(crossProject.status).toBe(404);
  });

  it('reports plan/run/child counts on the delete-impact endpoint', async () => {
    const parent = await request(app).post(`/api/v1/projects/${projectId}/milestones`).set(auth()).send({ name: 'Impact Parent' });
    await request(app).post(`/api/v1/projects/${projectId}/milestones`).set(auth()).send({ name: 'Impact Child', parentId: parent.body.milestone.id });
    await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth()).send({ name: 'Impact Plan', milestoneId: parent.body.milestone.id });

    const impact = await request(app).get(`/api/v1/milestones/${parent.body.milestone.id}/delete-impact`).set(auth());
    expect(impact.status).toBe(200);
    expect(impact.body).toMatchObject({ planCount: 1, runCount: 0, childMilestoneCount: 1 });
  });

  it('accepts startDate and references, and rejects date changes once completed', async () => {
    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set(auth())
      .send({ name: 'Dated milestone', startDate: '2026-01-01T00:00:00.000Z', dueDate: '2026-02-01T00:00:00.000Z', references: 'JIRA-1, JIRA-2' });
    expect(created.status).toBe(201);
    expect(created.body.milestone.references).toBe('JIRA-1, JIRA-2');
    const id = created.body.milestone.id;

    await request(app).patch(`/api/v1/milestones/${id}`).set(auth()).send({ isCompleted: true });

    const blocked = await request(app).patch(`/api/v1/milestones/${id}`).set(auth()).send({ dueDate: '2026-03-01T00:00:00.000Z' });
    expect(blocked.status).toBe(400);
  });
});

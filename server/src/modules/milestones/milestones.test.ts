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
});

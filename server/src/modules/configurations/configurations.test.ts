import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'config-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
});

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

async function seedProjectAndSuiteWithCase() {
  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Config ${Date.now()}-${Math.random()}` });
  const projectId = project.body.project.id;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
  const suiteId = suite.body.suite.id;
  const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Section' });
  await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Case' });
  return { projectId, suiteId };
}

describe('configurations', () => {
  it('creates a config group with seeded values, and rejects a duplicate group name', async () => {
    const { projectId } = await seedProjectAndSuiteWithCase();
    const group = await request(app)
      .post(`/api/v1/projects/${projectId}/config-groups`)
      .set(auth())
      .send({ name: 'Browsers', configs: ['Chrome', 'Firefox'] });
    expect(group.status).toBe(201);
    expect(group.body.configGroup.configs).toHaveLength(2);

    const dup = await request(app).post(`/api/v1/projects/${projectId}/config-groups`).set(auth()).send({ name: 'browsers' });
    expect(dup.status).toBe(400);
  });

  it('adds/renames/deletes individual config values within a group', async () => {
    const { projectId } = await seedProjectAndSuiteWithCase();
    const group = await request(app).post(`/api/v1/projects/${projectId}/config-groups`).set(auth()).send({ name: 'OS' });
    const groupId = group.body.configGroup.id;

    const config = await request(app).post(`/api/v1/config-groups/${groupId}/configs`).set(auth()).send({ name: 'Windows' });
    expect(config.status).toBe(201);
    const configId = config.body.config.id;

    const renamed = await request(app).patch(`/api/v1/configs/${configId}`).set(auth()).send({ name: 'Windows 11' });
    expect(renamed.body.config.name).toBe('Windows 11');

    const del = await request(app).delete(`/api/v1/configs/${configId}`).set(auth());
    expect(del.status).toBe(204);
  });

  it('creates one run per selected config when adding a run to a plan by-config', async () => {
    const { projectId, suiteId } = await seedProjectAndSuiteWithCase();
    const group = await request(app)
      .post(`/api/v1/projects/${projectId}/config-groups`)
      .set(auth())
      .send({ name: 'Browsers', configs: ['Chrome', 'Firefox'] });
    const configIds = group.body.configGroup.configs.map((c: { id: string }) => c.id);

    const plan = await request(app).post(`/api/v1/projects/${projectId}/plans`).set(auth()).send({ name: 'Cross-browser Plan' });
    const planId = plan.body.plan.id;

    const runs = await request(app)
      .post(`/api/v1/plans/${planId}/runs/by-config`)
      .set(auth())
      .send({ name: 'Smoke', suiteId, configIds });
    expect(runs.status).toBe(201);
    expect(runs.body.runs).toHaveLength(2);
    const names = runs.body.runs.map((r: { name: string }) => r.name).sort();
    expect(names).toEqual(['Smoke (Chrome)', 'Smoke (Firefox)']);
    const labels = runs.body.runs.map((r: { configLabel: string }) => r.configLabel).sort();
    expect(labels).toEqual(['Browsers: Chrome', 'Browsers: Firefox']);
  });
});

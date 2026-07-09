import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

let adminToken: string;
let testerToken: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'shared-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  await prisma.user.create({
    data: { email: 'shared-tester@example.com', name: 'Tester', role: 'TESTER', passwordHash: await hashPassword('TesterPass123!') },
  });
  adminToken = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' })).body.accessToken;
  testerToken = (await request(app).post('/api/v1/auth/login').send({ email: 'shared-tester@example.com', password: 'TesterPass123!' })).body.accessToken;
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedProjectSuiteSection() {
  const project = await request(app).post('/api/v1/projects').set(auth(adminToken)).send({ name: `Shared Steps ${Date.now()}-${Math.random()}` });
  const projectId = project.body.project.id;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth(adminToken)).send({ name: 'Suite' });
  const suiteId = suite.body.suite.id;
  const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth(adminToken)).send({ name: 'Section' });
  return { projectId, suiteId, sectionId: section.body.section.id };
}

describe('shared step sets', () => {
  it('rejects a TESTER creating a shared step set (ADMIN/LEAD only)', async () => {
    const { projectId } = await seedProjectSuiteSection();
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/shared-step-sets`)
      .set(auth(testerToken))
      .send({ name: 'Login', steps: [{ step: 'Open login page' }] });
    expect(res.status).toBe(403);
  });

  it('rejects a duplicate name (case-insensitive) within a project', async () => {
    const { projectId } = await seedProjectSuiteSection();
    await request(app)
      .post(`/api/v1/projects/${projectId}/shared-step-sets`)
      .set(auth(adminToken))
      .send({ name: 'Login', steps: [{ step: 'Open login page' }] });
    const dup = await request(app)
      .post(`/api/v1/projects/${projectId}/shared-step-sets`)
      .set(auth(adminToken))
      .send({ name: 'login', steps: [{ step: 'Open login page' }] });
    expect(dup.status).toBe(400);
  });

  it('attaches a shared set to a case, resolves it (live-linked) on read, and reflects edits immediately', async () => {
    const { projectId, sectionId } = await seedProjectSuiteSection();
    const set = await request(app)
      .post(`/api/v1/projects/${projectId}/shared-step-sets`)
      .set(auth(adminToken))
      .send({ name: 'Login flow', steps: [{ step: 'Open login page', expected: 'Page loads' }] });
    const setId = set.body.sharedStepSet.id;

    const testCase = await request(app)
      .post(`/api/v1/sections/${sectionId}/cases`)
      .set(auth(adminToken))
      .send({ title: 'Uses shared login', template: 'STEPS', sharedStepSetIds: [setId] });
    expect(testCase.body.case.sharedSteps).toEqual([{ id: setId, name: 'Login flow', steps: [{ step: 'Open login page', expected: 'Page loads' }] }]);

    await request(app)
      .patch(`/api/v1/shared-step-sets/${setId}`)
      .set(auth(adminToken))
      .send({ steps: [{ step: 'Open login page', expected: 'Page loads' }, { step: 'Enter creds', expected: 'Logged in' }] });

    const reread = await request(app).get(`/api/v1/cases/${testCase.body.case.id}`).set(auth(adminToken));
    expect(reread.body.case.sharedSteps[0].steps).toHaveLength(2);
  });

  it('promotes a case\'s own steps into a new shared set and links it', async () => {
    const { projectId, sectionId } = await seedProjectSuiteSection();
    const testCase = await request(app)
      .post(`/api/v1/sections/${sectionId}/cases`)
      .set(auth(adminToken))
      .send({ title: 'To promote', template: 'STEPS', steps: [{ step: 'Do X', expected: 'Y' }] });
    const caseId = testCase.body.case.id;

    const promoted = await request(app)
      .post(`/api/v1/cases/${caseId}/promote-shared-steps`)
      .set(auth(adminToken))
      .send({ name: 'Promoted set' });
    expect(promoted.status).toBe(201);
    expect(promoted.body.sharedStepSet.steps).toEqual([{ step: 'Do X', expected: 'Y' }]);

    const reread = await request(app).get(`/api/v1/cases/${caseId}`).set(auth(adminToken));
    expect(reread.body.case.steps).toBeNull();
    expect(reread.body.case.sharedSteps).toHaveLength(1);
    expect(reread.body.case.sharedSteps[0].name).toBe('Promoted set');
    void projectId;
  });

  it('reports delete-impact and cascades on delete, and a run snapshot stays immutable after the set is edited', async () => {
    const { projectId, suiteId, sectionId } = await seedProjectSuiteSection();
    const set = await request(app)
      .post(`/api/v1/projects/${projectId}/shared-step-sets`)
      .set(auth(adminToken))
      .send({ name: 'Reused steps', steps: [{ step: 'Step A' }] });
    const setId = set.body.sharedStepSet.id;

    const caseA = await request(app)
      .post(`/api/v1/sections/${sectionId}/cases`)
      .set(auth(adminToken))
      .send({ title: 'Case A', template: 'STEPS', sharedStepSetIds: [setId] });

    const impact = await request(app).get(`/api/v1/shared-step-sets/${setId}/delete-impact`).set(auth(adminToken));
    expect(impact.body.caseCount).toBe(1);

    const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth(adminToken)).send({ name: 'Run', suiteId });
    const tests = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth(adminToken));
    expect(tests.body.tests[0].stepsSnapshot).toEqual([{ step: 'Step A' }]);

    // Editing the shared set after the run was created must NOT retroactively change the snapshot.
    await request(app).patch(`/api/v1/shared-step-sets/${setId}`).set(auth(adminToken)).send({ steps: [{ step: 'Changed step' }] });
    const testsAfterEdit = await request(app).get(`/api/v1/runs/${run.body.run.id}/tests`).set(auth(adminToken));
    expect(testsAfterEdit.body.tests[0].stepsSnapshot).toEqual([{ step: 'Step A' }]);

    const del = await request(app).delete(`/api/v1/shared-step-sets/${setId}`).set(auth(adminToken));
    expect(del.status).toBe(204);
    const caseAfterDelete = await request(app).get(`/api/v1/cases/${caseA.body.case.id}`).set(auth(adminToken));
    expect(caseAfterDelete.body.case.sharedSteps).toEqual([]);
  });
});

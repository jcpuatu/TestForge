import http from 'http';
import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../config/prisma-client';
import { hashPassword } from '../../lib/password';

// This file tests webhook DELIVERY mechanics (HMAC signing, timeout, delivery logging) against a
// real local receiver server — exactly the kind of loopback target assertPublicHttpUrl now
// correctly rejects in production. That SSRF guard has its own dedicated test file
// (../../lib/urlSafety.test.ts); mocked out here so this file keeps testing what it always
// tested, instead of every test needing a public-internet target it can't control.
jest.mock('../../lib/urlSafety', () => ({ assertPublicHttpUrl: jest.fn().mockResolvedValue(undefined) }));

let adminToken: string;
let projectId: string;
let suiteId: string;

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

let receiver: http.Server;
let receiverUrl: string;
let receivedPayloads: unknown[] = [];

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: 'webhook-admin@example.com', name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword('AdminPass123!') },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'AdminPass123!' });
  adminToken = login.body.accessToken;

  const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'Webhook Project' });
  projectId = project.body.project.id;
  const suite = await request(app).post(`/api/v1/projects/${projectId}/suites`).set(auth()).send({ name: 'Suite' });
  suiteId = suite.body.suite.id;
  const section = await request(app).post(`/api/v1/suites/${suiteId}/sections`).set(auth()).send({ name: 'Section' });
  await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Case' });

  await new Promise<void>((resolve) => {
    receiver = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        receivedPayloads.push(JSON.parse(body));
        res.writeHead(200);
        res.end('ok');
      });
    });
    receiver.listen(0, () => {
      const address = receiver.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      receiverUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  receiver.close();
});

describe('webhooks', () => {
  it('fires a RUN_COMPLETED webhook when a run is closed, and logs the delivery', async () => {
    const webhook = await request(app)
      .post(`/api/v1/projects/${projectId}/webhooks`)
      .set(auth())
      .send({ url: receiverUrl, event: 'RUN_COMPLETED' });
    expect(webhook.status).toBe(201);
    expect(webhook.body.webhook.secret).toEqual(expect.any(String));

    const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: 'Run', suiteId });
    receivedPayloads = [];
    const closed = await request(app).post(`/api/v1/runs/${run.body.run.id}/close`).set(auth());
    expect(closed.status).toBe(200);

    // Delivery happens synchronously within the close request in this app, so it should already be recorded.
    expect(receivedPayloads).toHaveLength(1);
    expect(receivedPayloads[0]).toMatchObject({ event: 'RUN_COMPLETED', runId: run.body.run.id });

    const deliveries = await request(app).get(`/api/v1/webhooks/${webhook.body.webhook.id}/deliveries`).set(auth());
    expect(deliveries.body.deliveries).toHaveLength(1);
    expect(deliveries.body.deliveries[0].success).toBe(true);
  });

  it('does not fire for a different event type', async () => {
    await request(app).post(`/api/v1/projects/${projectId}/webhooks`).set(auth()).send({ url: receiverUrl, event: 'CASE_CREATED' });
    const run = await request(app).post(`/api/v1/projects/${projectId}/runs`).set(auth()).send({ name: 'Run 2', suiteId });
    receivedPayloads = [];
    await request(app).post(`/api/v1/runs/${run.body.run.id}/close`).set(auth());
    // Only the RUN_COMPLETED webhook from the previous test should fire, not the CASE_CREATED one.
    expect(receivedPayloads.filter((p) => (p as { event: string }).event === 'CASE_CREATED')).toHaveLength(0);
  });

  it('records a failed delivery when the endpoint is unreachable', async () => {
    const webhook = await request(app)
      .post(`/api/v1/projects/${projectId}/webhooks`)
      .set(auth())
      .send({ url: 'http://127.0.0.1:1/unreachable', event: 'RUN_COMPLETED' });

    const testPing = await request(app).post(`/api/v1/webhooks/${webhook.body.webhook.id}/test`).set(auth());
    expect(testPing.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 200));
    const deliveries = await request(app).get(`/api/v1/webhooks/${webhook.body.webhook.id}/deliveries`).set(auth());
    expect(deliveries.body.deliveries[0].success).toBe(false);
  });

  // Regression test: CASE_CREATED was a real enum value, selectable in the UI and accepted by
  // the schema, but no case-creation route anywhere ever called dispatchWebhookEvent for it —
  // a user configuring this event got silent, permanent non-delivery. The existing "does not
  // fire for a different event type" test above never actually created a case, so it couldn't
  // have caught this; this one does.
  // Each of these two tests creates its own dedicated project/suite/webhook rather than reusing
  // the outer describe block's shared `projectId` — an earlier test in this file ("does not fire
  // for a different event type") already registers its own CASE_CREATED webhook against the
  // shared project, and dispatchWebhookEvent correctly broadcasts to every matching webhook, so
  // reusing that project here would double-count deliveries for reasons that have nothing to do
  // with what's actually under test.
  it('fires a CASE_CREATED webhook when a case is created directly', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Case Created Direct ${Date.now()}` });
    const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(auth()).send({ name: 'Suite' });
    const section = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/sections`).set(auth()).send({ name: 'Section' });
    const webhook = await request(app)
      .post(`/api/v1/projects/${project.body.project.id}/webhooks`)
      .set(auth())
      .send({ url: receiverUrl, event: 'CASE_CREATED' });
    receivedPayloads = [];

    const created = await request(app).post(`/api/v1/sections/${section.body.section.id}/cases`).set(auth()).send({ title: 'Triggers webhook' });
    expect(created.status).toBe(201);

    expect(receivedPayloads).toHaveLength(1);
    expect(receivedPayloads[0]).toMatchObject({ event: 'CASE_CREATED', caseId: created.body.case.id, title: 'Triggers webhook' });

    const deliveries = await request(app).get(`/api/v1/webhooks/${webhook.body.webhook.id}/deliveries`).set(auth());
    expect(deliveries.body.deliveries[0].success).toBe(true);
  });

  it('fires one aggregate CASE_CREATED event (not one per row) for a CSV import batch', async () => {
    const project = await request(app).post('/api/v1/projects').set(auth()).send({ name: `Case Created Batch ${Date.now()}` });
    const suite = await request(app).post(`/api/v1/projects/${project.body.project.id}/suites`).set(auth()).send({ name: 'Suite' });
    await request(app).post(`/api/v1/projects/${project.body.project.id}/webhooks`).set(auth()).send({ url: receiverUrl, event: 'CASE_CREATED' });
    receivedPayloads = [];

    const csv = 'title\nImported Case 1\nImported Case 2\nImported Case 3';
    const imported = await request(app).post(`/api/v1/suites/${suite.body.suite.id}/cases/import`).set(auth()).send({ csv });
    expect(imported.status).toBe(201);
    expect(imported.body.imported).toBe(3);

    expect(receivedPayloads).toHaveLength(1);
    expect(receivedPayloads[0]).toMatchObject({ event: 'CASE_CREATED', count: 3 });
  });
});

describe('POST /api/v1/webhooks/:id/test', () => {
  // Regression test: dispatchWebhookEvent matches by project+event, so routing the test-ping
  // through it (as the original implementation did) fanned a "test THIS webhook" action out to
  // every other active webhook sharing the same project and event type — confirmed exploitable:
  // testing webhook A silently re-delivered a real notification to webhook B's endpoint too.
  it('delivers only to the specific webhook being tested, not other webhooks sharing the same project+event', async () => {
    const receivedB: unknown[] = [];
    const receiverB = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        receivedB.push(JSON.parse(body));
        res.writeHead(200);
        res.end('ok');
      });
    });
    const receiverBUrl = await new Promise<string>((resolve) => {
      receiverB.listen(0, () => {
        const address = receiverB.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

    try {
      const webhookA = await request(app).post(`/api/v1/projects/${projectId}/webhooks`).set(auth()).send({ url: receiverUrl, event: 'RUN_CREATED' });
      await request(app).post(`/api/v1/projects/${projectId}/webhooks`).set(auth()).send({ url: receiverBUrl, event: 'RUN_CREATED' });
      receivedPayloads = [];

      const testPing = await request(app).post(`/api/v1/webhooks/${webhookA.body.webhook.id}/test`).set(auth());
      expect(testPing.status).toBe(202);
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(receivedPayloads).toHaveLength(1);
      expect(receivedPayloads[0]).toMatchObject({ event: 'ping', ping: true });
      expect(receivedB).toHaveLength(0);
    } finally {
      receiverB.close();
    }
  });
});

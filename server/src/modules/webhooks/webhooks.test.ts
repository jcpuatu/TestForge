import http from 'http';
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
});

import crypto from 'crypto';
import { prisma } from '../config/prisma-client';

export type WebhookEvent = 'RUN_COMPLETED' | 'RUN_CREATED' | 'CASE_CREATED';

function sign(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function deliver(webhook: { id: string; url: string; secret: string }, payload: unknown) {
  const body = JSON.stringify(payload);
  const signature = sign(webhook.secret, body);

  let statusCode: number | null = null;
  let success = false;
  let responseBody: string | null = null;

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TestForge-Signature': signature },
      body,
      signal: AbortSignal.timeout(5000),
    });
    statusCode = res.status;
    success = res.ok;
    responseBody = (await res.text()).slice(0, 2000);
  } catch (err) {
    responseBody = err instanceof Error ? err.message : 'Request failed';
  }

  await prisma.webhookDelivery.create({
    data: { webhookId: webhook.id, statusCode, success, requestBody: body, responseBody },
  });
}

export async function dispatchWebhookEvent(projectId: string, event: WebhookEvent, payload: Record<string, unknown>) {
  const webhooks = await prisma.webhook.findMany({ where: { projectId, event, isActive: true } });
  const fullPayload = { event, ...payload };
  await Promise.allSettled(webhooks.map((webhook) => deliver(webhook, fullPayload)));
}

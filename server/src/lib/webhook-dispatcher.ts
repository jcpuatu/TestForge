import crypto from 'crypto';
import { prisma } from '../config/prisma-client';
import { assertPublicHttpUrl } from './urlSafety';

export type WebhookEvent = 'RUN_COMPLETED' | 'RUN_CREATED' | 'CASE_CREATED';

function sign(secret: string, timestamp: string, body: string): string {
  // The timestamp is part of the signed content, not just an extra header — a signature computed
  // over the body alone never expires, so anyone who captures one legitimate (body, signature)
  // pair could replay it to the receiver indefinitely. Binding the timestamp into the HMAC input
  // (Stripe/GitHub-style) means a receiver that also checks "is this timestamp recent" can reject
  // a replayed delivery outright, since replaying an old timestamp+signature pair verifies fine
  // cryptographically but fails the freshness check, and forging a fresh one requires the secret.
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// fetch (undici)'s own thrown error is always the generic "fetch failed" -- the actual reason
// (DNS lookup failure vs. connection refused vs. anything else) lives one level down in
// err.cause, which an earlier version of this code discarded by logging err.message alone. A DNS
// failure and a connection refusal both used to log the identical "fetch failed" with zero way to
// tell them apart from the delivery log. Extracted as a standalone function so the formatting
// logic can be tested directly against synthetic errors, rather than depending on a real network/
// DNS failure's timing inside a test.
export function formatDeliveryError(err: unknown): string {
  if (!(err instanceof Error)) return 'Request failed';
  const cause = err.cause;
  const causeMessage = cause instanceof Error ? cause.message : undefined;
  return causeMessage ? `${err.message}: ${causeMessage}` : err.message;
}

async function deliver(webhook: { id: string; url: string; secret: string }, payload: unknown) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = sign(webhook.secret, timestamp, body);

  let statusCode: number | null = null;
  let success = false;
  let responseBody: string | null = null;

  try {
    // Re-validated here, not just at registration time — a hostname's DNS record can change
    // between when a webhook was created and when it fires (DNS rebinding), and this also covers
    // any webhook that was already registered before this safety check existed.
    await assertPublicHttpUrl(webhook.url);
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TestForge-Signature': signature,
        'X-TestForge-Timestamp': timestamp,
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    statusCode = res.status;
    success = res.ok;
    responseBody = (await res.text()).slice(0, 2000);
  } catch (err) {
    responseBody = formatDeliveryError(err);
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

// Delivers to exactly the one webhook being tested — deliberately not routed through
// dispatchWebhookEvent, which matches by project+event and would otherwise fan a "test this one
// webhook" action out to every other active webhook sharing the same project and event type.
export async function deliverTestPing(webhook: { id: string; url: string; secret: string }, triggeredBy: string) {
  await deliver(webhook, { event: 'ping', ping: true, triggeredBy });
}

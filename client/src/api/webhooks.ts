import { apiFetch } from '../lib/apiClient';
import type { PaginationMeta } from './pagination';

export type WebhookEventType = 'RUN_COMPLETED' | 'RUN_CREATED' | 'CASE_CREATED';

export interface Webhook {
  id: string;
  projectId: string;
  url: string;
  event: WebhookEventType;
  isActive: boolean;
  createdAt: string;
  secret?: string;
}

export interface WebhookDelivery {
  id: string;
  statusCode: number | null;
  success: boolean;
  responseBody: string | null;
  createdAt: string;
}

export function listWebhooks(projectId: string) {
  return apiFetch<{ webhooks: Webhook[] }>(`/projects/${projectId}/webhooks`);
}

export function createWebhook(projectId: string, input: { url: string; event: WebhookEventType }) {
  return apiFetch<{ webhook: Webhook }>(`/projects/${projectId}/webhooks`, { method: 'POST', body: input });
}

export function deleteWebhook(id: string) {
  return apiFetch<void>(`/webhooks/${id}`, { method: 'DELETE' });
}

export function testWebhook(id: string) {
  return apiFetch<{ status: string }>(`/webhooks/${id}/test`, { method: 'POST' });
}

export function listDeliveries(id: string, page = 1, pageSize?: number) {
  const params = new URLSearchParams({ page: String(page) });
  if (pageSize) params.set('pageSize', String(pageSize));
  return apiFetch<{ deliveries: WebhookDelivery[] } & PaginationMeta>(`/webhooks/${id}/deliveries?${params.toString()}`);
}

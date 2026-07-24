import { apiFetch } from '../lib/apiClient';
import type { PaginationMeta } from './pagination';

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

export function listAuditLog(projectId: string, page = 1, pageSize?: number) {
  const params = new URLSearchParams({ page: String(page) });
  if (pageSize) params.set('pageSize', String(pageSize));
  return apiFetch<{ entries: AuditLogEntry[] } & PaginationMeta>(`/projects/${projectId}/audit-log?${params.toString()}`);
}

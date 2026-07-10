import { apiFetch } from '../lib/apiClient';

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

export function listAuditLog(projectId: string) {
  return apiFetch<{ entries: AuditLogEntry[] }>(`/projects/${projectId}/audit-log`);
}

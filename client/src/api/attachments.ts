import { apiFetch, ApiError, refreshSession } from '../lib/apiClient';
import { getAccessToken } from '../lib/tokenStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

// apiFetch always JSON-encodes its body, which is wrong for a file upload (needs a raw
// multipart/form-data body with a browser-generated boundary) — this bypasses it with a plain
// fetch + FormData, but keeps the same one-retry-after-refresh behavior for an expired token.
async function uploadFile(path: string, file: File): Promise<{ attachment: Attachment }> {
  const form = new FormData();
  form.append('file', file);

  const doFetch = () =>
    fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
      body: form,
    });

  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) res = await doFetch();
  }
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? res.statusText, data?.error?.code);
  return data;
}

export function listCaseAttachments(caseId: string) {
  return apiFetch<{ attachments: Attachment[] }>(`/cases/${caseId}/attachments`);
}

export function uploadCaseAttachment(caseId: string, file: File) {
  return uploadFile(`/cases/${caseId}/attachments`, file);
}

export function listResultAttachments(resultId: string) {
  return apiFetch<{ attachments: Attachment[] }>(`/results/${resultId}/attachments`);
}

export function uploadResultAttachment(resultId: string, file: File) {
  return uploadFile(`/results/${resultId}/attachments`, file);
}

export function deleteAttachment(id: string) {
  return apiFetch<void>(`/attachments/${id}`, { method: 'DELETE' });
}

export function attachmentDownloadUrl(id: string): string {
  return `${BASE_URL}/attachments/${id}`;
}

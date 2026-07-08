import { apiFetch } from '../lib/apiClient';
import type { Role, User } from './types';

export function listUsers() {
  return apiFetch<{ users: User[] }>('/users');
}

export interface DirectoryUser {
  id: string;
  name: string;
  role: Role;
}

export function listUserDirectory() {
  return apiFetch<{ users: DirectoryUser[] }>('/users/directory');
}

export function createUser(input: { email: string; name: string; password: string; role: Role }) {
  return apiFetch<{ user: User }>('/users', { method: 'POST', body: input });
}

export function updateUser(id: string, input: { role?: Role; isActive?: boolean; name?: string }) {
  return apiFetch<{ user: User }>(`/users/${id}`, { method: 'PATCH', body: input });
}

export interface ApiKeySummary {
  id: string;
  label: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function listApiKeys(userId: string) {
  return apiFetch<{ apiKeys: ApiKeySummary[] }>(`/users/${userId}/api-keys`);
}

export function createApiKey(userId: string, label: string) {
  return apiFetch<{ apiKey: { id: string; label: string; key: string; keyPrefix: string } }>(`/users/${userId}/api-keys`, {
    method: 'POST',
    body: { label },
  });
}

export function revokeApiKey(userId: string, keyId: string) {
  return apiFetch<void>(`/users/${userId}/api-keys/${keyId}`, { method: 'DELETE' });
}

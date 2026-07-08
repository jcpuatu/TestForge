import { apiFetch, refreshSession } from '../lib/apiClient';
import type { User } from './types';

export function login(email: string, password: string) {
  return apiFetch<{ accessToken: string; user: User }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRetry: true,
  });
}

export async function refresh(): Promise<{ accessToken: string; user: User }> {
  const result = await refreshSession();
  if (!result) {
    throw new Error('Session refresh failed');
  }
  return result as { accessToken: string; user: User };
}

export function logout() {
  return apiFetch<void>('/auth/logout', { method: 'POST', skipAuthRetry: true });
}

export function me() {
  return apiFetch<{ user: User }>('/auth/me');
}

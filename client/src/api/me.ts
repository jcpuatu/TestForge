import { apiFetch } from '../lib/apiClient';
import type { RunCase } from './runs';

export interface MyTest extends RunCase {
  run: { id: string; name: string; projectId: string; project: { name: string } };
}

export function listMyTests() {
  return apiFetch<{ tests: MyTest[] }>('/me/tests');
}

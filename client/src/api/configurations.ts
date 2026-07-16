import { apiFetch } from '../lib/apiClient';
import type { TestRun } from './runs';

export interface Config {
  id: string;
  configGroupId: string;
  name: string;
}

export interface ConfigGroup {
  id: string;
  projectId: string;
  name: string;
  configs: Config[];
}

export function listConfigGroups(projectId: string) {
  return apiFetch<{ configGroups: ConfigGroup[] }>(`/projects/${projectId}/config-groups`);
}

export function createConfigGroup(projectId: string, name: string, configs?: string[]) {
  return apiFetch<{ configGroup: ConfigGroup }>(`/projects/${projectId}/config-groups`, { method: 'POST', body: { name, configs } });
}

export function updateConfigGroup(id: string, name: string) {
  return apiFetch<{ configGroup: ConfigGroup }>(`/config-groups/${id}`, { method: 'PATCH', body: { name } });
}

export function deleteConfigGroup(id: string) {
  return apiFetch<void>(`/config-groups/${id}`, { method: 'DELETE' });
}

export function createConfig(configGroupId: string, name: string) {
  return apiFetch<{ config: Config }>(`/config-groups/${configGroupId}/configs`, { method: 'POST', body: { name } });
}

export function updateConfig(id: string, name: string) {
  return apiFetch<{ config: Config }>(`/configs/${id}`, { method: 'PATCH', body: { name } });
}

export function deleteConfig(id: string) {
  return apiFetch<void>(`/configs/${id}`, { method: 'DELETE' });
}

export function createPlanRunsByConfig(
  planId: string,
  input: { name: string; suiteId: string; caseIds?: string[]; configIds: string[]; assignedToId?: string },
) {
  return apiFetch<{ runs: TestRun[]; failed: { configId: string; configName: string; message: string }[] }>(
    `/plans/${planId}/runs/by-config`,
    { method: 'POST', body: input },
  );
}

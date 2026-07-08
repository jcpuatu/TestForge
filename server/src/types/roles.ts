export const ROLES = ['ADMIN', 'LEAD', 'TESTER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

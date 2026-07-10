import { prisma } from '../config/prisma-client';

// Fire-and-forget from the caller's perspective (awaited, but never blocks the actual mutation
// on a logging failure) — covers the specific actions flagged during the TestRail-parity audit
// as worth a paper trail: label edit/delete, section/suite/case delete, milestone/plan/run date
// changes, run close. Not a generic log-everything hook.
export async function logAudit(params: {
  projectId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
}) {
  await prisma.auditLog.create({ data: params });
}

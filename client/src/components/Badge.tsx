import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { Priority } from '../api/types';
import type { ResultStatus } from '../api/runs';

const PRIORITY_CLASSES: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-amber-100 text-amber-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={clsx('rounded px-1.5 py-0.5 text-xs font-medium', PRIORITY_CLASSES[priority])}>
      {priority}
    </span>
  );
}

// Matches TestRail's actual status palette (verified against product screenshots):
// Passed=green, Blocked=orange, Retest=teal/cyan, Failed=red, Untested=grey.
const STATUS_CLASSES: Record<ResultStatus, string> = {
  UNTESTED: 'bg-slate-100 text-slate-500',
  PASSED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  BLOCKED: 'bg-orange-100 text-orange-700',
  RETEST: 'bg-cyan-100 text-cyan-700',
};

export function StatusBadge({ status }: { status: ResultStatus }) {
  return <span className={clsx('rounded px-1.5 py-0.5 text-xs font-semibold', STATUS_CLASSES[status])}>{status}</span>;
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx('rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600', className)}>
      {children}
    </span>
  );
}

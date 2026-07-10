import type { ReactNode } from 'react';

// Shared layout for every report page: title/description, a filter bar (each report supplies
// its own filter controls — the filter shape differs enough per report, per architecture
// review, that one generic tabbed dialog would add abstraction overhead for little reuse; this
// shell is the actual shared piece), and the report body.
export function ReportShell({
  title,
  description,
  filters,
  children,
}: {
  title: string;
  description?: string;
  filters?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {description && <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      {filters && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          {filters}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

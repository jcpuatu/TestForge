import type { ReactNode } from 'react';
import { PrintButton } from '../../components/PrintButton';

// Shared layout for every report page: title/description, a filter bar (each report supplies
// its own filter controls — the filter shape differs enough per report, per architecture
// review, that one generic tabbed dialog would add abstraction overhead for little reuse; this
// shell is the actual shared piece), and the report body. PrintButton lives here (not on each
// of the 14 report pages individually) so every report gets it for free — added after a user
// asked for it specifically, since the Reports tab was never in scope for the original
// "Print Reports" doc audit (that doc's printer icon is on milestone/plan/run/cases views, a
// genuinely different TestRail feature that happens to share the word "reports").
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
    <div className="print-report">
      <div className="print:hidden mb-1 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <PrintButton />
      </div>
      {description && <p className="print:hidden mb-3 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      {/* A real document header for print — TestRail's own doc frames Print Reports as
          formatting the data "as a report," not just hiding nav on the interactive page. Hidden
          on screen (redundant with the h2/description above it), shown only when printing. */}
      <div className="hidden print:block print:mb-6 print:border-b print:border-black print:pb-3">
        <p className="text-xl font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-sm">{description}</p>}
        <p className="mt-1 text-xs">Generated {new Date().toLocaleString()}</p>
      </div>
      {filters && (
        <div className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          {filters}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

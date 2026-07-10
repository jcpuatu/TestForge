import { useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ActivitySummaryReport } from './cases/ActivitySummaryReport';
import { CoverageForReferencesReport } from './cases/CoverageForReferencesReport';
import { CasePropertyDistributionReport } from './cases/CasePropertyDistributionReport';
import { StatusTopsReport } from './cases/StatusTopsReport';
import { DefectsSummaryReport } from './defects/DefectsSummaryReport';
import { DefectsSummaryForCasesReport } from './defects/DefectsSummaryForCasesReport';
import { DefectsSummaryForReferencesReport } from './defects/DefectsSummaryForReferencesReport';
import { ComparisonForCasesReport } from './results/ComparisonForCasesReport';
import { ComparisonForReferencesReport } from './results/ComparisonForReferencesReport';
import { ResultPropertyDistributionReport } from './results/ResultPropertyDistributionReport';
import { MilestoneSummaryReport } from './summary/MilestoneSummaryReport';
import { PlanSummaryReport } from './summary/PlanSummaryReport';
import { ProjectSummaryReport } from './summary/ProjectSummaryReport';
import { RunsSummaryReport } from './summary/RunsSummaryReport';

interface ReportDef {
  key: string;
  label: string;
  Component: React.ComponentType<{ projectId: string }>;
}
interface ReportCategory {
  label: string;
  reports: ReportDef[];
}

// Every future report phase (Defects/Results/Summary reports, Phases I-J) just adds another
// category here — no new route needs registering per report, since the active report is
// tracked via ?report= rather than a nested path (keeps this list-of-many-small-views
// pattern from requiring a route per report while still being a bookmarkable URL).
const CATEGORIES: ReportCategory[] = [
  {
    label: 'Cases',
    reports: [
      { key: 'cases-activity-summary', label: 'Activity Summary', Component: ActivitySummaryReport },
      { key: 'cases-coverage-references', label: 'Coverage for References', Component: CoverageForReferencesReport },
      { key: 'cases-property-distribution', label: 'Property Distribution', Component: CasePropertyDistributionReport },
      { key: 'cases-status-tops', label: 'Status Tops', Component: StatusTopsReport },
    ],
  },
  {
    label: 'Defects',
    reports: [
      { key: 'defects-summary', label: 'Summary', Component: DefectsSummaryReport },
      { key: 'defects-summary-for-cases', label: 'Summary for Cases', Component: DefectsSummaryForCasesReport },
      { key: 'defects-summary-for-references', label: 'Summary for References', Component: DefectsSummaryForReferencesReport },
    ],
  },
  {
    label: 'Results',
    reports: [
      { key: 'results-comparison-for-cases', label: 'Comparison for Cases', Component: ComparisonForCasesReport },
      { key: 'results-comparison-for-references', label: 'Comparison for References', Component: ComparisonForReferencesReport },
      { key: 'results-property-distribution', label: 'Property Distribution', Component: ResultPropertyDistributionReport },
    ],
  },
  {
    label: 'Summary',
    reports: [
      { key: 'summary-milestone', label: 'Milestone', Component: MilestoneSummaryReport },
      { key: 'summary-plan', label: 'Plan', Component: PlanSummaryReport },
      { key: 'summary-project', label: 'Project', Component: ProjectSummaryReport },
      { key: 'summary-runs', label: 'Runs', Component: RunsSummaryReport },
    ],
  },
];

export function ReportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const allReports = CATEGORIES.flatMap((c) => c.reports);
  const activeKey = searchParams.get('report') ?? allReports[0].key;
  const active = allReports.find((r) => r.key === activeKey) ?? allReports[0];

  if (!projectId) return null;

  return (
    <div className="flex gap-6">
      <aside className="w-52 shrink-0">
        {CATEGORIES.map((cat) => (
          <div key={cat.label} className="mb-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {cat.label} Reports
            </p>
            <nav className="space-y-0.5">
              {cat.reports.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setSearchParams({ report: r.key })}
                  className={clsx(
                    'block w-full rounded-md px-2.5 py-1.5 text-left text-sm',
                    r.key === activeKey
                      ? 'bg-blue-50 dark:bg-blue-900/30 font-medium text-blue-700 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </nav>
          </div>
        ))}
      </aside>

      <div className="min-w-0 flex-1">
        <active.Component projectId={projectId} />
      </div>
    </div>
  );
}

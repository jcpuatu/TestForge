import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../../../api/defectsResultsReports';
import { RunCheckboxList } from '../RunCheckboxList';
import { SectionCheckboxList } from '../SectionCheckboxList';
import { useProjectSections } from '../useProjectSections';
import { ReportShell } from '../ReportShell';
import { MatrixTable } from '../MatrixTable';

export function ComparisonForCasesReport({ projectId }: { projectId: string }) {
  const [runIds, setRunIds] = useState<string[]>([]);
  const [sectionIds, setSectionIds] = useState<string[]>([]);

  const sectionsQuery = useProjectSections(projectId);
  const reportQuery = useQuery({
    queryKey: ['reports', 'results', 'comparison-for-cases', projectId, runIds, sectionIds],
    queryFn: () => reportsApi.getComparisonForCases(projectId, { runIds, sectionIds }),
  });
  const data = reportQuery.data;

  return (
    <ReportShell
      title="Comparison for Cases"
      description="Test results across a set of test runs, side by side per case — spot clusters of non-passing tests."
      filters={
        <>
          <div className="w-full">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Test runs (none selected = 25 most recent)</p>
            <RunCheckboxList projectId={projectId} selected={runIds} onChange={setRunIds} />
          </div>
          <div className="w-full">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Sections (none selected = all)</p>
            <SectionCheckboxList sections={sectionsQuery.data ?? []} selected={sectionIds} onChange={setSectionIds} />
          </div>
        </>
      }
    >
      {reportQuery.isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {data && <MatrixTable runs={data.runs} rows={data.cases} csvFilename="comparison-for-cases.csv" />}
    </ReportShell>
  );
}

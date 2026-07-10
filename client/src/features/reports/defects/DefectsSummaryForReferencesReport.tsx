import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../../../api/defectsResultsReports';
import { RunCheckboxList } from '../RunCheckboxList';
import { SectionCheckboxList } from '../SectionCheckboxList';
import { useProjectSections } from '../useProjectSections';
import { ReportShell } from '../ReportShell';
import { MatrixTable } from '../MatrixTable';

export function DefectsSummaryForReferencesReport({ projectId }: { projectId: string }) {
  const [runIds, setRunIds] = useState<string[]>([]);
  const [sectionIds, setSectionIds] = useState<string[]>([]);

  const sectionsQuery = useProjectSections(projectId);
  const reportQuery = useQuery({
    queryKey: ['reports', 'defects', 'summary-for-references', projectId, runIds, sectionIds],
    queryFn: () => reportsApi.getDefectsSummaryForReferences(projectId, { runIds, sectionIds }),
  });
  const data = reportQuery.data;

  return (
    <ReportShell
      title="Summary for References"
      description="Defects recorded per test case, grouped by the requirement reference it's linked to. Cases without a reference are excluded."
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
      {data && (
        <div className="space-y-4">
          {data.references.map((ref) => (
            <div key={ref.reference}>
              <p className="mb-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">{ref.reference}</p>
              <MatrixTable runs={data.runs} rows={ref.cases} showDefects csvFilename={`defects-summary-${ref.reference}.csv`} />
            </div>
          ))}
          {data.references.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">No referenced cases with defects in the selected runs.</p>
          )}
        </div>
      )}
    </ReportShell>
  );
}

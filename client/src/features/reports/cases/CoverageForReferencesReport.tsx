import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../../../api/casesReports';
import { useProjectSections } from '../useProjectSections';
import { SectionCheckboxList } from '../SectionCheckboxList';
import { ReportShell } from '../ReportShell';
import { StackedStatusBar } from '../../../components/StackedStatusBar';
import { DownloadCsvButton } from '../../../components/DownloadCsvButton';
import { downloadTableAsCsv } from '../../../lib/downloadCsv';

export function CoverageForReferencesReport({ projectId }: { projectId: string }) {
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [referenceIdsText, setReferenceIdsText] = useState('');
  const [includeWithRefs, setIncludeWithRefs] = useState(true);
  const [includeWithoutRefs, setIncludeWithoutRefs] = useState(true);

  const referenceIds = referenceIdsText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const sectionsQuery = useProjectSections(projectId);
  const reportQuery = useQuery({
    queryKey: ['reports', 'cases', 'coverage-for-references', projectId, sectionIds, referenceIds, includeWithRefs, includeWithoutRefs],
    queryFn: () => reportsApi.getCoverageForReferences(projectId, { sectionIds, referenceIds, includeWithRefs, includeWithoutRefs }),
  });
  const data = reportQuery.data;

  return (
    <ReportShell
      title="Coverage for References"
      description="Verifies test cases have been written for the requirements you've linked via References."
      filters={
        <>
          <div className="w-full">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Specific reference IDs (one per line, blank = all)</p>
            <textarea
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              rows={2}
              value={referenceIdsText}
              onChange={(e) => setReferenceIdsText(e.target.value)}
              placeholder="TRM-1&#10;TRM-42"
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={includeWithRefs} onChange={(e) => setIncludeWithRefs(e.target.checked)} />
            Cases with references
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={includeWithoutRefs} onChange={(e) => setIncludeWithoutRefs(e.target.checked)} />
            Cases without references
          </label>
          <div className="w-full">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Sections (none selected = all)</p>
            <SectionCheckboxList sections={sectionsQuery.data ?? []} selected={sectionIds} onChange={setSectionIds} />
          </div>
        </>
      }
    >
      {reportQuery.isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {data && (
        <>
          <div className="print-card mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-700 dark:text-slate-300">
                {Math.round(data.coveragePercent * 100)}% coverage — {data.coveredCount} of {data.total} cases have a reference
                {/* This stat is always project/section-wide — it doesn't get recomputed for a
                    "specific reference IDs" filter below, since "% of cases covered" isn't a
                    meaningful question once you've already narrowed to one or two specific IDs.
                    Previously this went unlabeled, so a filtered report silently showed an
                    unfiltered headline percentage sitting right above a filtered list. */}
                {referenceIds.length > 0 && (
                  <span className="text-slate-400 dark:text-slate-500"> (not filtered by the reference IDs below)</span>
                )}
              </span>
            </div>
            <StackedStatusBar
              counts={{ PASSED: data.coveredCount, FAILED: 0, BLOCKED: 0, RETEST: 0, UNTESTED: data.uncoveredCount }}
              total={data.total}
              labels={{ PASSED: 'Has a reference', UNTESTED: 'No reference' }}
            />
          </div>

          <div className="mb-2 flex justify-end">
            <DownloadCsvButton
              onClick={() =>
                downloadTableAsCsv(
                  ['Title', 'Reference'],
                  [
                    ...data.references.flatMap((r) => r.cases.map((c) => [c.title, r.reference])),
                    ...data.casesWithoutReferences.map((c) => [c.title, '']),
                  ],
                  'coverage-for-references.csv',
                )
              }
            />
          </div>

          {/* This block is what "Cases with references" actually refers to — the checkbox was
              previously wired to a server-side field (casesWithReferences) the client never
              read, so toggling it visibly changed nothing. Gating the real with-references
              display instead, mirroring the without-references block's own working pattern
              directly below. */}
          {includeWithRefs && (
            <div className="print-card mb-4 divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              {data.references.map((r) => (
                <div key={r.reference} className="p-2.5">
                  <p className="mb-1 text-sm font-medium text-slate-800 dark:text-slate-200">{r.reference}</p>
                  {r.cases.map((c) => (
                    <p key={c.id} className="pl-3 text-xs text-slate-500 dark:text-slate-400">
                      {c.title}
                    </p>
                  ))}
                </div>
              ))}
              {data.references.length === 0 && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No references found.</p>}
            </div>
          )}

          {includeWithoutRefs && data.casesWithoutReferences.length > 0 && (
            <div className="print-card divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <p className="p-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Cases without references
              </p>
              {data.casesWithoutReferences.map((c) => (
                <div key={c.id} className="p-2.5 text-sm text-slate-700 dark:text-slate-300">
                  {c.title}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </ReportShell>
  );
}

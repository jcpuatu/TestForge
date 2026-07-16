import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../../../api/casesReports';
import type { DateRangePreset } from '../../../api/casesReports';
import { useProjectSections } from '../useProjectSections';
import { SectionCheckboxList } from '../SectionCheckboxList';
import { DateRangePresetPicker } from '../DateRangePresetPicker';
import { ReportShell } from '../ReportShell';
import { ActivityOverTimeChart } from '../../../components/ActivityOverTimeChart';
import { Select } from '../../../components/Input';
import { DownloadCsvButton } from '../../../components/DownloadCsvButton';
import { downloadTableAsCsv } from '../../../lib/downloadCsv';

export function ActivitySummaryReport({ projectId }: { projectId: string }) {
  const [preset, setPreset] = useState<DateRangePreset>('thisWeek');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState<'day' | 'month' | 'section'>('day');
  const [includeNew, setIncludeNew] = useState(true);
  const [includeUpdated, setIncludeUpdated] = useState(true);
  const [sectionIds, setSectionIds] = useState<string[]>([]);

  const sectionsQuery = useProjectSections(projectId);
  const reportQuery = useQuery({
    queryKey: ['reports', 'cases', 'activity-summary', projectId, preset, from, to, groupBy, includeNew, includeUpdated, sectionIds],
    queryFn: () => reportsApi.getActivitySummary(projectId, { preset, from, to, groupBy, includeNew, includeUpdated, sectionIds }),
  });
  const data = reportQuery.data;

  return (
    <ReportShell
      title="Activity Summary"
      description="Test cases created or updated in a given time period — a pulse check on test-design activity."
      filters={
        <>
          <DateRangePresetPicker
            preset={preset}
            from={from}
            to={to}
            onChange={(next) => {
              setPreset(next.preset);
              setFrom(next.from);
              setTo(next.to);
            }}
          />
          <div className="w-40 shrink-0">
            <Select aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
              <option value="day">Group by Day</option>
              <option value="month">Group by Month</option>
              <option value="section">Group by Section</option>
            </Select>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={includeNew} onChange={(e) => setIncludeNew(e.target.checked)} />
            New cases
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={includeUpdated} onChange={(e) => setIncludeUpdated(e.target.checked)} />
            Updated cases
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
          <div className="mb-4 flex gap-6">
            <div>
              <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{data.newCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">New</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{data.updatedCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Updated</p>
            </div>
          </div>

          {data.series && (
            <div className="print-card mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
              <ActivityOverTimeChart
                data={data.series}
                seriesKeys={[
                  { key: 'created', label: 'New', color: 'bg-blue-500' },
                  { key: 'updated', label: 'Updated', color: 'bg-emerald-500' },
                ]}
              />
            </div>
          )}

          {data.groups && (
            <div className="print-card mb-4 divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              {data.groups.map((g) => (
                <div key={g.sectionId ?? 'none'} className="flex items-center justify-between p-2.5 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{g.sectionName}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {g.created > 0 && <span className="mr-2 text-blue-600 dark:text-blue-400">C {g.created}</span>}
                    {g.updated > 0 && <span className="text-emerald-600 dark:text-emerald-400">U {g.updated}</span>}
                  </span>
                </div>
              ))}
              {data.groups.length === 0 && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No activity in this range.</p>}
            </div>
          )}

          <div className="mb-2 flex justify-end">
            <DownloadCsvButton
              onClick={() =>
                downloadTableAsCsv(
                  ['Title', 'Section', 'Change', 'Date'],
                  data.cases.map((c) => [c.title, c.sectionName ?? '', c.changeType, new Date(c.at).toLocaleDateString()]),
                  'activity-summary.csv',
                )
              }
            />
          </div>
          <div className="print-card divide-y divide-slate-200 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            {data.cases.slice(0, 100).map((c) => (
              <div key={`${c.id}-${c.changeType}`} className="flex items-center justify-between p-2.5 text-sm">
                <span className="text-slate-700 dark:text-slate-300">{c.title}</span>
                <span className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                  {c.sectionName && <span>{c.sectionName}</span>}
                  <span className={c.changeType === 'created' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {c.changeType === 'created' ? 'Created' : 'Updated'}
                  </span>
                  <span>{new Date(c.at).toLocaleDateString()}</span>
                </span>
              </div>
            ))}
            {data.cases.length === 0 && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No activity in this range.</p>}
          </div>
        </>
      )}
    </ReportShell>
  );
}

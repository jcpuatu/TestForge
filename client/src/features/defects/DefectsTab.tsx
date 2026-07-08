import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import * as defectsApi from '../../api/defects';
import { DefectText } from '../../components/DefectText';
import { Badge } from '../../components/Badge';

export function DefectsTab() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'defects'],
    queryFn: () => defectsApi.listProjectDefects(projectId!),
    enabled: !!projectId,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">Defects</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Every defect ID/link ever entered on a test result in this project, rolled up by how many test cases still
        reference it. This is not a real Jira connection (see the API Keys / docs for what a real integration would
        need) — it's just aggregating whatever text testers have typed into the Defect IDs field.
      </p>

      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        {data?.defects.map((d) => (
          <div key={d.id} className="p-3">
            <button className="flex w-full items-center justify-between text-left" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
              <div className="flex items-center gap-2">
                <DefectText value={d.id} />
                {d.openCount > 0 ? (
                  <Badge className="bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400">{d.openCount} still failing</Badge>
                ) : (
                  <Badge className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">looks resolved</Badge>
                )}
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {d.count} reference{d.count === 1 ? '' : 's'} · last seen {new Date(d.lastSeenAt).toLocaleDateString()}
              </span>
            </button>
            {expandedId === d.id && (
              <div className="mt-2 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2">
                {d.cases.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span>
                      {c.caseTitle} <span className="text-slate-400 dark:text-slate-500">— {c.runName}</span>
                    </span>
                    <Link to={`/runs/${c.runId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                      view run
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {data?.defects.length === 0 && <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No defects linked yet.</p>}
      </div>
    </div>
  );
}

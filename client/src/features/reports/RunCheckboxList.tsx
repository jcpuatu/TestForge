import { useQuery } from '@tanstack/react-query';
import * as runsApi from '../../api/runs';

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

// Pick-individually run selection, shared across every report that scopes itself to a set of
// test runs (Status Tops here in Phase H; the Defects/Results/Summary reports in Phases I-J).
// Real TestRail also offers a filter-by-criteria mode (Assigned To/Milestone/etc.) to bulk-add
// matching runs — deferred until Phase I where more reports actually need it.
export function RunCheckboxList({
  projectId,
  selected,
  onChange,
}: {
  projectId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useQuery({ queryKey: ['projects', projectId, 'runs'], queryFn: () => runsApi.listRuns(projectId) });
  const runs = data?.runs ?? [];

  if (runs.length === 0) return <p className="text-xs text-slate-400 dark:text-slate-500">No test runs yet.</p>;

  return (
    <div className="max-h-40 space-y-0.5 overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-700">
      {runs.map((r) => (
        <label key={r.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={selected.includes(r.id)} onChange={() => onChange(toggleInArray(selected, r.id))} />
          {r.name}
          {r.isCompleted && <span className="text-xs text-slate-400 dark:text-slate-500">(closed)</span>}
        </label>
      ))}
    </div>
  );
}

import type { ProjectSection } from './useProjectSections';

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

// Cases reports span every suite in a project, so (unlike CsvExportDialog's single-suite
// section tree) this groups checkboxes under a suite-name header rather than assuming one
// suite's worth of sections.
export function SectionCheckboxList({
  sections,
  selected,
  onChange,
}: {
  sections: ProjectSection[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const bySuite = new Map<string, ProjectSection[]>();
  for (const s of sections) {
    bySuite.set(s.suiteName, [...(bySuite.get(s.suiteName) ?? []), s]);
  }

  if (sections.length === 0) return <p className="text-xs text-slate-400 dark:text-slate-500">No sections yet.</p>;

  return (
    <div className="max-h-40 space-y-2 overflow-y-auto rounded border border-slate-200 p-2 dark:border-slate-700">
      {[...bySuite.entries()].map(([suiteName, suiteSections]) => (
        <div key={suiteName}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{suiteName}</p>
          {suiteSections.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 py-0.5 pl-3 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => onChange(toggleInArray(selected, s.id))} />
              {s.name}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import * as suitesApi from '../../api/suites';
import type { Section } from '../../api/types';

export interface ProjectSection extends Section {
  suiteName: string;
}

// Cases reports span every suite in a project (no project-wide "list all sections" endpoint
// exists, since sections are always fetched per-suite elsewhere) — fetch the suite list once,
// then every suite's detail (which already includes its sections) in parallel.
export function useProjectSections(projectId: string | undefined) {
  return useQuery({
    queryKey: ['projects', projectId, 'all-sections'],
    queryFn: async () => {
      const { suites } = await suitesApi.listSuites(projectId!);
      const details = await Promise.all(suites.map((s) => suitesApi.getSuite(s.id)));
      const sections: ProjectSection[] = [];
      for (const { suite } of details) {
        for (const section of suite.sections) sections.push({ ...section, suiteName: suite.name });
      }
      return sections;
    },
    enabled: !!projectId,
  });
}

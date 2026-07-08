import type { RunCase, Result } from '@prisma/client';
import { toCsv } from '../../lib/csv';

const PRIORITY_TO_JIRA: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Highest',
};

const HEADER = ['Summary', 'Description', 'Issue Type', 'Priority', 'Labels'];

function formatSteps(stepsJson: string | null): string {
  if (!stepsJson) return '';
  const steps = JSON.parse(stepsJson) as { step: string; expected?: string }[];
  return steps.map((s, i) => `${i + 1}. ${s.step}${s.expected ? ` (expected: ${s.expected})` : ''}`).join('\n');
}

export function defectsToJiraCsv(
  runCases: (RunCase & { results?: Result[] })[],
  runName: string,
  suiteName: string | undefined,
): string {
  const failing = runCases.filter((rc) => rc.status === 'FAILED' || rc.status === 'BLOCKED');

  const rows = failing.map((rc) => {
    const latest = rc.results?.[0];
    const steps = formatSteps(rc.stepsSnapshot);
    const description = [
      `Environment: ${suiteName ?? ''} / ${runName}`,
      steps ? `\nSteps to Reproduce:\n${steps}` : '',
      rc.expectedSnapshot ? `\nExpected Result:\n${rc.expectedSnapshot}` : '',
      latest?.comment ? `\nActual Result:\n${latest.comment}` : '',
      `\nStatus: ${rc.status}`,
    ]
      .filter(Boolean)
      .join('\n');

    return [
      `[${runName}] ${rc.titleSnapshot}`,
      description,
      'Bug',
      PRIORITY_TO_JIRA[rc.priority] ?? 'Medium',
      'testforge',
    ];
  });

  return toCsv([HEADER, ...rows]);
}

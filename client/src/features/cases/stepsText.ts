import type { CaseStep } from '../../api/types';

// Simple line-based editor format: "step text | expected result" per line.
// Keeps the case form to a single textarea for v1 instead of a full repeatable-row editor.
export function stepsToText(steps: CaseStep[] | null | undefined): string {
  if (!steps || steps.length === 0) return '';
  return steps.map((s) => (s.expected ? `${s.step} | ${s.expected}` : s.step)).join('\n');
}

// Returns [] (not undefined) for empty input — this is submitted as a real "clear the steps"
// value, not omitted from the request. CaseForm previously relied on this returning undefined
// for an emptied textarea, which meant PATCH silently left the case's existing steps untouched
// (the apiClient drops undefined-valued keys, and Prisma leaves an absent key's column alone) —
// a tester who deleted a case's steps and saved got no error, but the old steps were still there.
export function textToSteps(text: string): CaseStep[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  return lines.map((line) => {
    const [step, expected] = line.split('|').map((part) => part.trim());
    return expected ? { step, expected } : { step };
  });
}

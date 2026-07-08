import type { CaseStep } from '../../api/types';

// Simple line-based editor format: "step text | expected result" per line.
// Keeps the case form to a single textarea for v1 instead of a full repeatable-row editor.
export function stepsToText(steps: CaseStep[] | null | undefined): string {
  if (!steps || steps.length === 0) return '';
  return steps.map((s) => (s.expected ? `${s.step} | ${s.expected}` : s.step)).join('\n');
}

export function textToSteps(text: string): CaseStep[] | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  return lines.map((line) => {
    const [step, expected] = line.split('|').map((part) => part.trim());
    return expected ? { step, expected } : { step };
  });
}

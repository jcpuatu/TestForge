// Line-based "step | expected" format shared with the client's steps textarea
// convention (client/src/features/cases/stepsText.ts) — used for CSV round-tripping.

export function stepsToLines(stepsJson: string | null): string {
  if (!stepsJson) return '';
  const steps = JSON.parse(stepsJson) as { step: string; expected?: string }[];
  return steps.map((s) => (s.expected ? `${s.step} | ${s.expected}` : s.step)).join('\n');
}

export function linesToSteps(text: string | undefined): { step: string; expected?: string }[] | undefined {
  if (!text) return undefined;
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  return lines.map((line) => {
    const [step, expected] = line.split('|').map((part) => part.trim());
    return expected ? { step, expected } : { step };
  });
}

import type { BddKeyword, BddLine } from '../../api/types';

const KEYWORDS: BddKeyword[] = ['Given', 'When', 'Then', 'And', 'But'];

// Same lightweight line-based editor philosophy as stepsText.ts: one "Keyword text" per line
// instead of a repeatable-row form.
export function bddLinesToText(lines: BddLine[] | null | undefined): string {
  if (!lines || lines.length === 0) return '';
  return lines.map((l) => `${l.keyword} ${l.text}`).join('\n');
}

export function textToBddLines(text: string): BddLine[] | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  return lines.map((line) => {
    const [first, ...rest] = line.split(' ');
    const keyword = KEYWORDS.find((k) => k.toLowerCase() === first.toLowerCase());
    return keyword ? { keyword, text: rest.join(' ').trim() } : { keyword: 'And' as const, text: line };
  });
}

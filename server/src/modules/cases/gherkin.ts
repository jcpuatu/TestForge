export interface BddLine {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
}

export interface ParsedScenario {
  name: string;
  lines: BddLine[];
}

export interface ParsedFeature {
  featureName: string;
  scenarios: ParsedScenario[];
}

const STEP_LINE = /^(Given|When|Then|And|But)\s+(.*)$/i;
const FEATURE_LINE = /^Feature:\s*(.*)$/i;
const SCENARIO_LINE = /^(?:Scenario|Scenario Outline):\s*(.*)$/i;

// Minimal Gherkin subset: Feature/Scenario/Given/When/Then/And/But. Background steps, Examples
// tables (Scenario Outline data rows), and tags (@lines) are recognized-but-skipped — a
// documented scope reduction, not silently dropped support.
export function parseFeatureFile(text: string): ParsedFeature {
  let featureName = 'Imported';
  const scenarios: ParsedScenario[] = [];
  let current: ParsedScenario | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('@')) continue;

    const featureMatch = line.match(FEATURE_LINE);
    if (featureMatch) {
      featureName = featureMatch[1].trim() || featureName;
      continue;
    }

    const scenarioMatch = line.match(SCENARIO_LINE);
    if (scenarioMatch) {
      if (current) scenarios.push(current);
      current = { name: scenarioMatch[1].trim() || 'Untitled scenario', lines: [] };
      continue;
    }

    const stepMatch = line.match(STEP_LINE);
    if (stepMatch && current) {
      const keyword = (stepMatch[1][0].toUpperCase() + stepMatch[1].slice(1).toLowerCase()) as BddLine['keyword'];
      current.lines.push({ keyword, text: stepMatch[2].trim() });
    }
  }
  if (current) scenarios.push(current);

  return { featureName, scenarios };
}

export function casesToFeatureFile(featureName: string, cases: { title: string; bddLines: BddLine[] }[]): string {
  const blocks = cases.map((c) => {
    const stepLines = c.bddLines.map((l) => `    ${l.keyword} ${l.text}`).join('\n');
    return `  Scenario: ${c.title}\n${stepLines}`;
  });
  return `Feature: ${featureName}\n\n${blocks.join('\n\n')}\n`;
}

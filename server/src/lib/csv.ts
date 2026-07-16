// Minimal RFC4180-ish CSV encode/decode — no external dependency needed for the
// small, well-controlled field set this app writes (case title/steps/etc).

// A field starting with one of these is interpreted as a formula by Excel/Sheets, not literal
// text — e.g. a case title of `=HYPERLINK("http://evil.example","click")` would execute the next
// time a teammate opens this app's own CSV export (case export, defects export — every CSV this
// app produces goes through toCsvField) in a spreadsheet. The standard OWASP CSV-injection
// mitigation: prefix with a single quote, which Excel/Sheets both strip from the display, leaving
// the rest as inert text.
const FORMULA_TRIGGER_CHARS = /^[=+\-@]/;

export function toCsvField(value: string | null | undefined): string {
  let str = value ?? '';
  if (FORMULA_TRIGGER_CHARS.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(toCsvField).join(',')).join('\r\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (char === '\r') {
      i++;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += char;
    i++;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

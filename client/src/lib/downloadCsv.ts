// Client-side CSV generation for report tables — the data is already loaded in the browser
// (each report page's own useQuery result), so this skips a server round-trip entirely rather
// than reusing the server's `lib/csv.ts` encoder. Mirrors that encoder's own quoting rule
// (quote only when a field contains a comma/quote/newline) for consistent output shape.
function toCsvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function downloadTableAsCsv(headers: string[], rows: (string | number | null | undefined)[][], filename: string) {
  const csv = [headers, ...rows].map((row) => row.map(toCsvField).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

import { Printer } from 'lucide-react';

// Browser-native print (Phase K) — no server-side PDF generation, matching TestRail's own
// actual "Save to PDF via your system's print dialog" implementation. Pairs with the
// `@media print` rules in index.css; the button itself carries `no-print` so it never appears
// on the printed page/PDF.
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
    >
      <Printer className="h-3.5 w-3.5" />
      Print
    </button>
  );
}

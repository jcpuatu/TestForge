import { useState } from 'react';
import { ChevronDown, Printer } from 'lucide-react';

// Toggling this class on <html> before printing lets a page mark secondary content as
// `.print-detail-only` (comments, defects, steps, result history, etc.) — Outline mode hides it
// via the @media print rule in index.css, so the same on-page content serves both print modes
// without a separate report-builder view. Always cleared first (idempotent) and cleaned up via
// `afterprint` rather than assuming window.print() blocks synchronously.
function printWithMode(mode: 'outline' | 'details') {
  const root = document.documentElement;
  root.classList.remove('print-outline');
  if (mode === 'details') {
    window.print();
    return;
  }
  root.classList.add('print-outline');
  function cleanup() {
    root.classList.remove('print-outline');
    window.removeEventListener('afterprint', cleanup);
  }
  window.addEventListener('afterprint', cleanup);
  window.print();
}

// Browser-native print (Phase K) — no server-side PDF generation, matching TestRail's own
// actual "Save to PDF via your system's print dialog" implementation. The Outline/Details choice
// mirrors TestRail's own print-report customization (names only vs. full detail).
export function PrintButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="no-print relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        <Printer className="h-3.5 w-3.5" />
        Print
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-32 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800">
          <button
            onClick={() => {
              setOpen(false);
              printWithMode('outline');
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Outline
          </button>
          <button
            onClick={() => {
              setOpen(false);
              printWithMode('details');
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Details
          </button>
        </div>
      )}
    </div>
  );
}

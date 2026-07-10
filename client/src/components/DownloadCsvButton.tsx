import { Download } from 'lucide-react';

export function DownloadCsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="no-print flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
    >
      <Download className="h-3.5 w-3.5" />
      Download CSV
    </button>
  );
}

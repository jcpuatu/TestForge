import { useRef, useState, type DragEvent } from 'react';
import { Download, Paperclip, Trash2 } from 'lucide-react';
import type { Attachment } from '../api/attachments';
import { attachmentDownloadUrl } from '../api/attachments';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Uses native HTML5 drag-and-drop (dragover/drop events), not @dnd-kit — dnd-kit is for
// reordering in-app elements (sections/cases elsewhere in this codebase); dropping an OS file
// onto the page is a different browser API entirely, with no dnd-kit equivalent.
export function AttachmentsPanel({
  attachments,
  onUpload,
  onDelete,
  uploading,
  canManage,
}: {
  attachments: Attachment[];
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
  uploading?: boolean;
  canManage: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onUpload(file);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Attachments ({attachments.length})
        </p>
        {canManage && (
          <button
            type="button"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : '+ Attach file'}
          </button>
        )}
      </div>

      {canManage && (
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      )}

      {canManage && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`mb-2 rounded-md border-2 border-dashed p-3 text-center text-xs ${
            isDragOver
              ? 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500'
          }`}
        >
          Drag a file here, or click "+ Attach file"
        </div>
      )}

      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs">
              <div className="flex min-w-0 items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                <span className="truncate text-slate-700 dark:text-slate-300">{a.filename}</span>
                <span className="shrink-0 text-slate-400 dark:text-slate-500">
                  {formatSize(a.size)} · {a.uploadedBy?.name ?? 'Unknown'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={attachmentDownloadUrl(a.id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Download ${a.filename}`}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                {canManage && (
                  <button
                    onClick={() => onDelete(a.id)}
                    aria-label={`Delete ${a.filename}`}
                    className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/50 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const URL_PATTERN = /^https?:\/\//i;

// Defect IDs are free text (e.g. "BUG-123") that may or may not be a full URL —
// render as a real link when it looks like one, plain text otherwise.
export function DefectText({ value }: { value: string }) {
  if (URL_PATTERN.test(value.trim())) {
    return (
      <a
        href={value.trim()}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-red-600 underline hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        onClick={(e) => e.stopPropagation()}
      >
        [{value}]
      </a>
    );
  }
  return <span className="font-medium text-red-600 dark:text-red-400">[{value}]</span>;
}

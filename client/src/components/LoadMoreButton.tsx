import { Button } from './Button';

interface LoadMoreButtonProps {
  loadedCount: number;
  total: number;
  hasMore: boolean;
  isFetching: boolean;
  onClick: () => void;
}

export function LoadMoreButton({ loadedCount, total, hasMore, isFetching, onClick }: LoadMoreButtonProps) {
  if (!hasMore && loadedCount === 0) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-3">
      <span className="text-xs text-slate-400 dark:text-slate-500">
        Showing {loadedCount} of {total}
      </span>
      {hasMore && (
        <Button variant="secondary" onClick={onClick} disabled={isFetching}>
          {isFetching ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}

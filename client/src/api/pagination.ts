// Additive envelope fields every paginated list endpoint returns alongside its own array key
// (e.g. `{ cases: [...], ...PaginationMeta }`) — see server/src/lib/pagination.ts.
export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

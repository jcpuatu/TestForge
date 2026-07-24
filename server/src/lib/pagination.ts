export interface PaginationParams {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
}

export interface PaginationOptions {
  defaultPageSize?: number;
  maxPageSize?: number;
}

// Shared page/pageSize query-param parsing for list endpoints. 1-indexed page numbers (more
// intuitive for a UI page control than a raw offset), clamped to sane bounds so a malformed or
// adversarial query param can't request page 0 (negative skip) or an unbounded page size.
export function parsePagination(query: Record<string, unknown>, options: PaginationOptions = {}): PaginationParams {
  const defaultPageSize = options.defaultPageSize ?? 50;
  const maxPageSize = options.maxPageSize ?? 200;

  const rawPage = typeof query.page === 'string' ? parseInt(query.page, 10) : NaN;
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawPageSize = typeof query.pageSize === 'string' ? parseInt(query.pageSize, 10) : NaN;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize >= 1 ? Math.min(rawPageSize, maxPageSize) : defaultPageSize;

  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

// Additive envelope fields merged alongside a list endpoint's existing array key (e.g.
// `{ cases: [...], ...paginationMeta(total, params) }`) — never replaces it, so every existing
// caller that only reads the array key keeps working unchanged; only callers that need to fetch
// beyond the first page need to read these.
export function paginationMeta(total: number, params: PaginationParams) {
  return { total, page: params.page, pageSize: params.pageSize, hasMore: params.page * params.pageSize < total };
}

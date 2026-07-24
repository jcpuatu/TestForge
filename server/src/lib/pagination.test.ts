import { paginationMeta, parsePagination } from './pagination';

describe('parsePagination', () => {
  it('defaults to page 1 at the given default page size when no params are sent', () => {
    expect(parsePagination({}, { defaultPageSize: 50 })).toEqual({ skip: 0, take: 50, page: 1, pageSize: 50 });
  });

  it('computes skip from page and pageSize', () => {
    expect(parsePagination({ page: '3', pageSize: '20' })).toEqual({ skip: 40, take: 20, page: 3, pageSize: 20 });
  });

  it('clamps an oversized pageSize to the configured max', () => {
    const result = parsePagination({ pageSize: '99999' }, { maxPageSize: 200 });
    expect(result.pageSize).toBe(200);
  });

  it('falls back to page 1 for a non-positive or malformed page value', () => {
    expect(parsePagination({ page: '0' }).page).toBe(1);
    expect(parsePagination({ page: '-5' }).page).toBe(1);
    expect(parsePagination({ page: 'not-a-number' }).page).toBe(1);
  });

  it('falls back to the default pageSize for a non-positive or malformed pageSize value', () => {
    expect(parsePagination({ pageSize: '0' }, { defaultPageSize: 50 }).pageSize).toBe(50);
    expect(parsePagination({ pageSize: 'nope' }, { defaultPageSize: 50 }).pageSize).toBe(50);
  });
});

describe('paginationMeta', () => {
  it('reports hasMore true when more rows exist past the current page', () => {
    const params = parsePagination({ page: '1', pageSize: '10' });
    expect(paginationMeta(25, params)).toEqual({ total: 25, page: 1, pageSize: 10, hasMore: true });
  });

  it('reports hasMore false on the last page, including an exact-multiple total', () => {
    const lastPage = parsePagination({ page: '3', pageSize: '10' });
    expect(paginationMeta(25, lastPage).hasMore).toBe(false);
    const exact = parsePagination({ page: '2', pageSize: '10' });
    expect(paginationMeta(20, exact).hasMore).toBe(false);
  });
});

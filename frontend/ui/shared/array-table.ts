import type { PageState, TableController } from "@calliopelabs/ui";
import * as React from "react";

export interface ArrayTableOptions<TRow> {
  /** Every row the query returned. */
  rows: readonly TRow[];
  loading: boolean;
  error?: { message: string } | null;
  retry: () => void;
  /** The search the query takes, held by the route; null where the query takes none. */
  search?: { value: string; onChange: (value: string) => void } | null;
  /** True while a search or filter narrows the query. */
  isFiltered: boolean;
  clearFilters: () => void;
  pageSize?: number;
}

/**
 * A TableController over a query with no server paging (GetEndpoints,
 * GetAgentGroups, GetEvents return whole lists today). It pages what came
 * back, offers no sort (the server does not sort these), and keeps rows on
 * screen while a new answer is in flight. Replace with a server cursor
 * controller once the query pages; the DataTable does not change. Candidate
 * for @calliopelabs/ui beside the TableController type, with a
 * `fixtureController` for stories.
 */
export function useArrayTable<TRow>({
  rows,
  loading,
  error,
  retry,
  search,
  isFiltered,
  clearFilters,
  pageSize: initialPageSize = 25,
}: ArrayTableOptions<TRow>): TableController<TRow> {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const index = Math.min(pageIndex, pages - 1);
  const state: PageState = error
    ? "error"
    : loading && rows.length === 0
      ? "loading"
      : rows.length === 0
        ? isFiltered
          ? "emptyFiltered"
          : "empty"
        : "ready";
  return {
    rows: rows.slice(index * pageSize, (index + 1) * pageSize),
    state,
    error: error ?? null,
    retry,
    totalCount: loading ? null : rows.length,
    pageIndex: index,
    hasNext: index < pages - 1,
    hasPrev: index > 0,
    next: () => setPageIndex(index + 1),
    prev: () => setPageIndex(index - 1),
    pageSize,
    setPageSize: (size) => {
      setPageSize(size);
      setPageIndex(0);
    },
    search: search?.value ?? "",
    setSearch: (value) => {
      setPageIndex(0);
      search?.onChange(value);
    },
    searchEnabled: Boolean(search),
    isStale: loading && rows.length > 0,
    sort: undefined,
    toggleSort: () => {},
    sortEnabled: false,
    isFiltered,
    clearFilters: () => {
      setPageIndex(0);
      clearFilters();
    },
  };
}

/**
 * A TableController over a list the server returns whole. The policy, rule
 * and prompt queries take a search and filters but no page arguments yet, so
 * paging is done here, over what the server sent, until they page. Search
 * stays the server's: the screen passes `search` through to the route, which
 * sends it as a variable. Sorting is off: there is no server sort to drive.
 */
import {
  DEFAULT_PAGE_SIZE,
  type PageState,
  type TableController,
} from "@calliopelabs/ui";
import * as React from "react";

export interface ListControllerOptions<TRow> {
  rows: readonly TRow[];
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
  /** The search box's value; absent, the table draws no search box. */
  search?: string;
  onSearchChange?: (search: string) => void;
  /** True when a search or filter narrows the list. */
  filtered: boolean;
  onClearFilters: () => void;
  pageSize?: number;
}

export function listState(
  loading: boolean,
  error: unknown,
  count: number,
  filtered: boolean,
): PageState {
  if (error) return "error";
  if (loading && count === 0) return "loading";
  if (count === 0) return filtered ? "emptyFiltered" : "empty";
  return "ready";
}

export function useListController<TRow>({
  rows,
  loading,
  error,
  onRetry,
  search,
  onSearchChange,
  filtered,
  onClearFilters,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
}: ListControllerOptions<TRow>): TableController<TRow> {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const index = Math.min(pageIndex, pages - 1);
  return {
    rows: rows.slice(index * pageSize, (index + 1) * pageSize),
    state: listState(loading, error, rows.length, filtered),
    error: error ?? null,
    retry: onRetry,
    totalCount: loading ? null : rows.length,
    pageIndex: index,
    hasNext: index < pages - 1,
    hasPrev: index > 0,
    next: () => setPageIndex(index + 1),
    prev: () => setPageIndex(Math.max(0, index - 1)),
    pageSize,
    setPageSize: (size) => {
      setPageSize(size);
      setPageIndex(0);
    },
    search: search ?? "",
    setSearch: (value) => {
      setPageIndex(0);
      onSearchChange?.(value);
    },
    searchEnabled: onSearchChange !== undefined,
    isStale: loading && rows.length > 0,
    sort: undefined,
    toggleSort: () => {},
    sortEnabled: false,
    isFiltered: filtered,
    clearFilters: () => {
      setPageIndex(0);
      onClearFilters();
    },
  };
}

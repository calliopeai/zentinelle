/**
 * A TableController (@calliopelabs/ui) over a list the server returns whole.
 * Many Zentinelle queries (the Activity operations, `GetPolicies`,
 * `GetEndpoints`, `GetAgentGroups`, the settings and registry lists) take a
 * search and filters but no page or sort arguments, so until they do, this
 * pages what arrived and leaves sorting off. Search and filters stay the
 * server's: `search` is the live input, and the route debounces it into the
 * query's variables. Rows stay on screen while a refetch is in flight
 * (`isStale`). Rows held wholly in memory and narrowed there use the
 * package's `useLocalTable` instead.
 */
import {
  DEFAULT_PAGE_SIZE,
  type PageState,
  type TableController,
} from "@calliopelabs/ui";
import * as React from "react";

/** One list as a screen receives it: what the query returned, and how it is doing. */
export interface ListSource<TRow> {
  rows: readonly TRow[];
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
}

export interface ListControllerOptions<TRow> extends ListSource<TRow> {
  /** True when a filter other than search narrows the result set. */
  isFiltered?: boolean;
  clearFilters?: () => void;
  /** Present only when the query takes a search argument. */
  search?: string;
  onSearchChange?: (search: string) => void;
  pageSize?: number;
}

export function pageStateOf(
  rowCount: number,
  {
    loading,
    error,
    isFiltered,
  }: { loading?: boolean; error?: unknown; isFiltered?: boolean },
): PageState {
  if (error) return "error";
  if (loading && rowCount === 0) return "loading";
  if (rowCount === 0) return isFiltered ? "emptyFiltered" : "empty";
  return "ready";
}

const noop = () => {};

export function useListController<TRow>({
  rows,
  loading = false,
  error,
  onRetry,
  isFiltered = false,
  clearFilters,
  search,
  onSearchChange,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
}: ListControllerOptions<TRow>): TableController<TRow> {
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  const [requestedPage, setPageIndex] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // A narrower result set can leave the page past its end; clamp, never blank.
  const pageIndex = Math.min(requestedPage, pageCount - 1);
  const start = pageIndex * pageSize;
  const filtered = isFiltered || Boolean(search?.trim());

  return {
    rows: rows.slice(start, start + pageSize),
    state: pageStateOf(rows.length, { loading, error, isFiltered: filtered }),
    error: error ?? null,
    retry: onRetry ?? noop,
    totalCount: loading && rows.length === 0 ? null : rows.length,
    pageIndex,
    hasNext: pageIndex < pageCount - 1,
    hasPrev: pageIndex > 0,
    next: () => setPageIndex(pageIndex + 1),
    prev: () => setPageIndex(Math.max(0, pageIndex - 1)),
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
    toggleSort: noop,
    sortEnabled: false,
    isFiltered: filtered,
    clearFilters: () => {
      setPageIndex(0);
      onSearchChange?.("");
      clearFilters?.();
    },
  };
}

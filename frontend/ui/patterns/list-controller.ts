/**
 * A TableController (@calliopelabs/ui) over a list the server returned
 * whole. Most Zentinelle list queries (`risks`, `complianceOverview`, the
 * REST evidence maps) take filters but no page arguments, so the route holds
 * one answer and this pages through it. Sorting stays the server's: none is
 * offered. Search and filters are the query's arguments, owned by the route.
 */
import {
  DEFAULT_PAGE_SIZE,
  type PageState,
  type TableController,
} from "@calliopelabs/ui";
import * as React from "react";

export interface ListControllerOptions {
  loading?: boolean;
  error?: { message: string } | null;
  retry?: () => void;
  /** The query's search argument; absent, the table shows no search box. */
  search?: string;
  onSearchChange?: (search: string) => void;
  /** True when search or a filter narrows the result. */
  isFiltered?: boolean;
  clearFilters?: () => void;
  pageSize?: number;
}

export function pageStateOf(
  count: number,
  { loading, error, isFiltered }: ListControllerOptions,
): PageState {
  if (loading) return "loading";
  if (error) return "error";
  if (count === 0) return isFiltered ? "emptyFiltered" : "empty";
  return "ready";
}

export function useListController<TRow>(
  rows: readonly TRow[],
  options: ListControllerOptions = {},
): TableController<TRow> {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(
    options.pageSize ?? DEFAULT_PAGE_SIZE,
  );
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const index = Math.min(pageIndex, pages - 1);
  return {
    rows: rows.slice(index * pageSize, (index + 1) * pageSize),
    state: pageStateOf(rows.length, options),
    error: options.error ?? null,
    retry: options.retry ?? (() => {}),
    totalCount: options.loading || options.error ? null : rows.length,
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
    search: options.search ?? "",
    setSearch: options.onSearchChange ?? (() => {}),
    searchEnabled: Boolean(options.onSearchChange),
    isStale: false,
    sort: undefined,
    toggleSort: () => {},
    sortEnabled: false,
    isFiltered: Boolean(options.isFiltered),
    clearFilters: options.clearFilters ?? (() => {}),
  };
}

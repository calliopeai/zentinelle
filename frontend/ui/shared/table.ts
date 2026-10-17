/**
 * A DataTable controller for a result the server returns whole and short (a
 * showback report, the last canary runs, a registry query with no paging):
 * one page, no client sort, and search only when the query takes it, passed
 * back to the route that refetches. A list that can grow without bound gets a
 * paged controller in its route instead.
 */
import type { PageState, TableController } from "@calliopelabs/ui";

export interface FixedListOptions<TRow> {
  rows: readonly TRow[];
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** The query's search argument, when it has one. */
  search?: string;
  onSearchChange?: (search: string) => void;
  /** A filter other than search is narrowing the rows. */
  filtered?: boolean;
  onClearFilters?: () => void;
  /** The previous answer is on screen while the next is in flight. */
  stale?: boolean;
}

export function stateOf(options: {
  loading?: boolean;
  error?: unknown;
  count: number;
  filtered: boolean;
}): PageState {
  if (options.error) return "error";
  if (options.loading && options.count === 0) return "loading";
  if (options.count === 0) return options.filtered ? "emptyFiltered" : "empty";
  return "ready";
}

const noop = () => {};

export function fixedList<TRow>({
  rows,
  loading,
  error,
  onRetry = noop,
  search = "",
  onSearchChange,
  filtered = false,
  onClearFilters = noop,
  stale = false,
}: FixedListOptions<TRow>): TableController<TRow> {
  const isFiltered = filtered || search.trim() !== "";
  return {
    rows,
    state: stateOf({
      loading,
      error,
      count: rows.length,
      filtered: isFiltered,
    }),
    error: error ?? null,
    retry: onRetry,
    totalCount: rows.length,
    pageIndex: 0,
    hasNext: false,
    hasPrev: false,
    next: noop,
    prev: noop,
    pageSize: Math.max(rows.length, 1),
    pageSizes: [Math.max(rows.length, 1)],
    setPageSize: noop,
    search,
    setSearch: onSearchChange ?? noop,
    searchEnabled: Boolean(onSearchChange),
    isStale: stale || Boolean(loading && rows.length > 0),
    sort: undefined,
    toggleSort: noop,
    sortEnabled: false,
    isFiltered,
    clearFilters: () => {
      onSearchChange?.("");
      onClearFilters();
    },
  };
}

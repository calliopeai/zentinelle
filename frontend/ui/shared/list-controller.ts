/**
 * A TableController (from @calliopelabs/ui) for a list the server returns
 * whole: one page, no server sort. Settings lists are short and bounded
 * (keys, holds, retention policies), and their queries take no paging
 * arguments. A list that can grow without bound needs a paged controller.
 * Candidate for the package.
 */
import type { PageState, TableController } from "@calliopelabs/ui";

export interface ListControllerOptions<TRow> {
  rows: readonly TRow[] | null | undefined;
  loading?: boolean;
  error?: { message: string } | null;
  retry?: () => void;
  /** Search and filters narrowing the list, so no rows means "no matches". */
  isFiltered?: boolean;
  clearFilters?: () => void;
  /** The query takes a search argument; the controller owns none otherwise. */
  search?: { value: string; onChange: (value: string) => void };
}

export function listState(
  rows: readonly unknown[] | null | undefined,
  loading = false,
  error: { message: string } | null = null,
  isFiltered = false,
): PageState {
  if (error) return "error";
  if (loading && !rows?.length) return "loading";
  if (!rows?.length) return isFiltered ? "emptyFiltered" : "empty";
  return "ready";
}

const noop = () => {};

export function listController<TRow>({
  rows,
  loading = false,
  error = null,
  retry = noop,
  isFiltered = false,
  clearFilters = noop,
  search,
}: ListControllerOptions<TRow>): TableController<TRow> {
  const list = rows ?? [];
  return {
    rows: list,
    state: listState(list, loading, error, isFiltered),
    error,
    retry,
    totalCount: list.length,
    pageIndex: 0,
    hasNext: false,
    hasPrev: false,
    next: noop,
    prev: noop,
    pageSize: Math.max(list.length, 1),
    setPageSize: noop,
    search: search?.value ?? "",
    setSearch: search?.onChange ?? noop,
    searchEnabled: Boolean(search),
    isStale: loading && list.length > 0,
    sort: undefined,
    toggleSort: noop,
    sortEnabled: false,
    isFiltered,
    clearFilters,
  };
}

/**
 * A DataTable controller in any state, for stories: typed against the
 * package's TableController so a story cannot drift from the contract.
 * The package keeps the same helper unexported (src/data/table.fixtures.ts).
 */
import type { TableController } from "@calliopelabs/ui";

const noop = () => {};

export function fixtureController<TRow>(
  overrides: Partial<TableController<TRow>> = {},
): TableController<TRow> {
  const rows = overrides.rows ?? [];
  return {
    rows,
    state: rows.length ? "ready" : "empty",
    error: null,
    retry: noop,
    totalCount: rows.length,
    pageIndex: 0,
    hasNext: false,
    hasPrev: false,
    next: noop,
    prev: noop,
    pageSize: 25,
    setPageSize: noop,
    search: "",
    setSearch: noop,
    searchEnabled: false,
    isStale: false,
    sort: undefined,
    toggleSort: noop,
    sortEnabled: false,
    isFiltered: false,
    clearFilters: noop,
    ...overrides,
  };
}

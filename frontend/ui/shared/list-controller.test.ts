import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  pageStateOf,
  useListController,
  type ListControllerOptions,
} from "./list-controller";

describe("pageStateOf", () => {
  it("tells empty from empty after filtering", () => {
    expect(pageStateOf(0, {})).toBe("empty");
    expect(pageStateOf(0, { isFiltered: true })).toBe("emptyFiltered");
  });

  it("is loading only with nothing to show, and puts an error before the rows", () => {
    expect(pageStateOf(3, { loading: true })).toBe("ready");
    expect(pageStateOf(0, { loading: true })).toBe("loading");
    expect(pageStateOf(0, { error: new Error("x") })).toBe("error");
    expect(pageStateOf(3, { error: new Error("x") })).toBe("error");
  });
});

const ROWS = Array.from({ length: 30 }, (_, i) => i);

function hook(overrides: Partial<ListControllerOptions<number>> = {}) {
  return renderHook(() => useListController({ rows: ROWS, ...overrides }))
    .result;
}

describe("useListController", () => {
  it("pages what arrived, 25 at a time by default", () => {
    const result = hook();
    expect(result.current.rows).toHaveLength(25);
    expect(result.current.totalCount).toBe(30);
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.hasNext).toBe(true);
    act(() => result.current.next());
    expect(result.current.rows).toEqual([25, 26, 27, 28, 29]);
    expect(result.current.hasNext).toBe(false);
  });

  it("takes a page size", () => {
    const result = hook({ pageSize: 10 });
    expect(result.current.rows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    act(() => result.current.next());
    expect(result.current.rows[0]).toBe(10);
  });

  it("clamps the page when the list shrinks", () => {
    const { result, rerender } = renderHook(
      ({ list }) => useListController({ rows: list, pageSize: 10 }),
      { initialProps: { list: ROWS } },
    );
    act(() => result.current.next());
    act(() => result.current.next());
    rerender({ list: ROWS.slice(0, 5) });
    expect(result.current.pageIndex).toBe(0);
    expect(result.current.rows).toHaveLength(5);
  });

  it("tells empty from empty after filtering or searching", () => {
    expect(hook({ rows: [] }).current.state).toBe("empty");
    expect(hook({ rows: [], isFiltered: true }).current.state).toBe(
      "emptyFiltered",
    );
    expect(
      hook({ rows: [], search: "x", onSearchChange: () => {} }).current.state,
    ).toBe("emptyFiltered");
  });

  it("is loading only with nothing to show, and stale while a refetch is in flight", () => {
    const loading = hook({ rows: [], loading: true }).current;
    expect(loading.state).toBe("loading");
    expect(loading.totalCount).toBeNull();
    const refetching = hook({ loading: true }).current;
    expect(refetching.state).toBe("ready");
    expect(refetching.isStale).toBe(true);
    expect(refetching.totalCount).toBe(30);
  });

  it("puts an error before the rows, and retries", () => {
    const onRetry = vi.fn();
    const result = hook({ error: { message: "down" }, onRetry });
    expect(result.current.state).toBe("error");
    result.current.retry();
    expect(onRetry).toHaveBeenCalled();
  });

  it("offers search only where the query takes one, and goes back to the first page", () => {
    expect(hook().current.searchEnabled).toBe(false);
    const onSearchChange = vi.fn();
    const result = hook({ search: "ci", onSearchChange });
    expect(result.current.searchEnabled).toBe(true);
    expect(result.current.search).toBe("ci");
    act(() => result.current.next());
    act(() => result.current.setSearch("bot"));
    expect(onSearchChange).toHaveBeenCalledWith("bot");
    expect(result.current.pageIndex).toBe(0);
  });

  it("clears the search with the filters", () => {
    const onSearchChange = vi.fn();
    const clearFilters = vi.fn();
    const result = hook({
      rows: [],
      search: "pii",
      onSearchChange,
      clearFilters,
    });
    act(() => result.current.clearFilters());
    expect(onSearchChange).toHaveBeenCalledWith("");
    expect(clearFilters).toHaveBeenCalled();
  });

  it("never offers a client sort", () => {
    expect(hook().current.sortEnabled).toBe(false);
  });
});

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { pageStateOf, useListController } from "./list-controller";

describe("pageStateOf", () => {
  it("tells empty from empty after filtering", () => {
    expect(pageStateOf(0, {})).toBe("empty");
    expect(pageStateOf(0, { isFiltered: true })).toBe("emptyFiltered");
  });

  it("keeps rows on screen while a new answer loads or fails", () => {
    expect(pageStateOf(3, { loading: true })).toBe("ready");
    expect(pageStateOf(3, { error: new Error("x") })).toBe("ready");
    expect(pageStateOf(0, { loading: true })).toBe("loading");
    expect(pageStateOf(0, { error: new Error("x") })).toBe("error");
  });
});

describe("useListController", () => {
  const rows = Array.from({ length: 30 }, (_, i) => i);

  it("pages what arrived", () => {
    const { result } = renderHook(() =>
      useListController({ rows, pageSize: 10 }),
    );
    expect(result.current.rows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.current.hasPrev).toBe(false);
    act(() => result.current.next());
    expect(result.current.rows[0]).toBe(10);
    expect(result.current.totalCount).toBe(30);
  });

  it("clamps the page when the list shrinks", () => {
    const { result, rerender } = renderHook(
      ({ list }) => useListController({ rows: list, pageSize: 10 }),
      { initialProps: { list: rows } },
    );
    act(() => result.current.next());
    act(() => result.current.next());
    rerender({ list: rows.slice(0, 5) });
    expect(result.current.pageIndex).toBe(0);
    expect(result.current.rows).toHaveLength(5);
  });

  it("offers search only when the query takes one, and clears it with the filters", () => {
    const onSearchChange = vi.fn();
    const clearFilters = vi.fn();
    const plain = renderHook(() => useListController({ rows }));
    expect(plain.result.current.searchEnabled).toBe(false);

    const searched = renderHook(() =>
      useListController({
        rows: [],
        search: "pii",
        onSearchChange,
        clearFilters,
      }),
    );
    expect(searched.result.current.state).toBe("emptyFiltered");
    act(() => searched.result.current.clearFilters());
    expect(onSearchChange).toHaveBeenCalledWith("");
    expect(clearFilters).toHaveBeenCalled();
  });
});

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useArrayTable, type ArrayTableOptions } from "./array-table";
import { payloadOrThrow } from "./mutation";

const ROWS = Array.from({ length: 30 }, (_, i) => ({ id: String(i) }));

function options(overrides: Partial<ArrayTableOptions<{ id: string }>> = {}) {
  return {
    rows: ROWS,
    loading: false,
    retry: vi.fn(),
    isFiltered: false,
    clearFilters: vi.fn(),
    ...overrides,
  };
}

describe("useArrayTable", () => {
  it("pages what the query returned, 25 at a time", () => {
    const { result } = renderHook(() => useArrayTable(options()));
    expect(result.current.rows).toHaveLength(25);
    expect(result.current.totalCount).toBe(30);
    expect(result.current.hasNext).toBe(true);
    act(() => result.current.next());
    expect(result.current.rows.map((r) => r.id)).toEqual([
      "25",
      "26",
      "27",
      "28",
      "29",
    ]);
    expect(result.current.hasNext).toBe(false);
  });

  it("tells empty from empty after filtering", () => {
    expect(
      renderHook(() => useArrayTable(options({ rows: [] }))).result.current
        .state,
    ).toBe("empty");
    expect(
      renderHook(() => useArrayTable(options({ rows: [], isFiltered: true })))
        .result.current.state,
    ).toBe("emptyFiltered");
  });

  it("is loading only with nothing to show, and stale while a refetch is in flight", () => {
    expect(
      renderHook(() => useArrayTable(options({ rows: [], loading: true })))
        .result.current.state,
    ).toBe("loading");
    const refetching = renderHook(() =>
      useArrayTable(options({ loading: true })),
    ).result.current;
    expect(refetching.state).toBe("ready");
    expect(refetching.isStale).toBe(true);
  });

  it("puts an error before the rows", () => {
    const { result } = renderHook(() =>
      useArrayTable(options({ error: { message: "down" } })),
    );
    expect(result.current.state).toBe("error");
  });

  it("offers search only where the query takes one, and goes back to the first page", () => {
    expect(
      renderHook(() => useArrayTable(options())).result.current.searchEnabled,
    ).toBe(false);
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useArrayTable(options({ search: { value: "", onChange } })),
    );
    act(() => result.current.next());
    act(() => result.current.setSearch("bot"));
    expect(onChange).toHaveBeenCalledWith("bot");
    expect(result.current.pageIndex).toBe(0);
  });

  it("never offers a client sort", () => {
    expect(
      renderHook(() => useArrayTable(options())).result.current.sortEnabled,
    ).toBe(false);
  });
});

describe("payloadOrThrow", () => {
  it("passes a successful payload", () => {
    expect(payloadOrThrow({ success: true }, "no")).toEqual({ success: true });
  });

  it("fails on success false, with the server's message", () => {
    expect(() =>
      payloadOrThrow({ success: false, error: "taken" }, "no"),
    ).toThrow("taken");
    expect(() => payloadOrThrow({ success: false, error: null }, "no")).toThrow(
      "no",
    );
  });

  it("fails on errors, and on no payload at all", () => {
    expect(() => payloadOrThrow({ errors: ["a", "b"] }, "no")).toThrow("a b");
    expect(() => payloadOrThrow(null, "no")).toThrow("no");
  });
});

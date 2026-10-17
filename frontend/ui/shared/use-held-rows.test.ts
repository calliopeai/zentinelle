import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useHeldRows } from "./use-held-rows";

type Row = { id: string };
const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));

describe("useHeldRows", () => {
  it("shows the first answer whole, then holds what arrives", () => {
    const { result, rerender } = renderHook(
      ({ incoming, key }) => useHeldRows(incoming, (r) => r.id, key),
      { initialProps: { incoming: rows("b", "a"), key: "" } },
    );
    expect(result.current.rows.map((r) => r.id)).toEqual(["b", "a"]);

    rerender({ incoming: rows("d", "c", "b", "a"), key: "" });
    expect(result.current.rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(result.current.heldCount).toBe(2);

    act(() => result.current.release());
    expect(result.current.rows.map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
    expect(result.current.heldCount).toBe(0);
  });

  it("starts over when the key changes", () => {
    const { result, rerender } = renderHook(
      ({ incoming, key }) => useHeldRows(incoming, (r) => r.id, key),
      { initialProps: { incoming: rows("a"), key: "all" } },
    );
    rerender({ incoming: rows("x", "y"), key: "audit" });
    expect(result.current.rows.map((r) => r.id)).toEqual(["x", "y"]);
    expect(result.current.heldCount).toBe(0);
  });
});

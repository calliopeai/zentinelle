import { describe, expect, it } from "vitest";

import { listController, listState } from "./list-controller";

describe("listController", () => {
  it("names every state", () => {
    expect(listState(undefined, true)).toBe("loading");
    expect(listState([], false, { message: "x" })).toBe("error");
    expect(listState([], false, null, false)).toBe("empty");
    expect(listState([], false, null, true)).toBe("emptyFiltered");
    expect(listState([1])).toBe("ready");
  });

  it("keeps rows on screen while a refetch is in flight", () => {
    const c = listController({ rows: [1, 2], loading: true });
    expect(c.state).toBe("ready");
    expect(c.isStale).toBe(true);
    expect(c.hasNext).toBe(false);
  });

  it("enables search only when the query takes one", () => {
    expect(listController({ rows: [] }).searchEnabled).toBe(false);
    const c = listController({
      rows: [],
      search: { value: "ci", onChange: () => {} },
    });
    expect(c.searchEnabled).toBe(true);
    expect(c.search).toBe("ci");
  });
});

import { describe, expect, it } from "vitest";

import { payloadOrThrow } from "./mutation";

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

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth/session", () => ({ login: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function configure(mode: string, oidc_enabled: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode, oidc_enabled }),
    }),
  );
}

describe("runtime sign-in", () => {
  it("offers SSO without a password form in SSO mode", async () => {
    configure("sso", true);
    render(<LoginPage />);
    const link = await screen.findByRole("link", { name: "Sign in with SSO" });
    expect(link.getAttribute("href")).toBe(
      "/api/zentinelle/v1/auth/oidc/login",
    );
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("preserves the existing local password form", async () => {
    configure("local", false);
    render(<LoginPage />);
    expect(await screen.findByLabelText("Password")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in with SSO" })).toBeNull();
  });

  it("does not fall back to password login when SSO is unconfigured", async () => {
    configure("sso", false);
    render(<LoginPage />);
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("does not expose password login when configuration cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<LoginPage />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Unable to load/),
    );
    expect(screen.queryByLabelText("Password")).toBeNull();
  });
});

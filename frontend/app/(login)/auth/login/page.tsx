"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth/session";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [authConfig, setAuthConfig] = useState<{
    mode: string;
    oidc_enabled: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/zentinelle/v1/auth/config", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load sign-in options.");
        const config = await response.json();
        if (
          typeof config.mode !== "string" ||
          typeof config.oidc_enabled !== "boolean"
        ) {
          throw new Error("Unable to load sign-in options.");
        }
        setAuthConfig(config);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(username, password);

      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <img src="/logo.svg" alt="Zentinelle" className="h-10 w-auto" />
        <h1 className="text-2xl font-semibold tracking-tight">Zentinelle</h1>
        <p className="text-muted-foreground text-sm">
          Sign in to the GRC portal
        </p>
      </div>

      {!authConfig && !error && <p role="status">Loading sign-in options…</p>}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {authConfig?.oidc_enabled && (
        <a
          href="/api/zentinelle/v1/auth/oidc/login"
          className="bg-primary text-primary-foreground inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-medium"
        >
          Sign in with SSO
        </a>
      )}
      {authConfig?.mode === "sso" && !authConfig.oidc_enabled && (
        <p role="alert">
          Single sign-on is not configured. Contact your administrator.
        </p>
      )}
      {authConfig && authConfig.mode !== "sso" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="username"
              className="text-sm font-medium leading-none"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter your username"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium leading-none"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}

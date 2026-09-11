/** Session requests obtain a masked token even when the CSRF cookie is HttpOnly. */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";
let pendingToken: Promise<string> | undefined;

function csrfToken(): Promise<string> {
  if (!pendingToken) {
    pendingToken = fetch(`${API_URL}/auth/csrf`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Unable to establish a secure session");
        const data = await response.json();
        if (typeof data.csrf_token !== "string")
          throw new Error("Missing CSRF token");
        return data.csrf_token;
      })
      .finally(() => {
        pendingToken = undefined;
      });
  }
  return pendingToken;
}

export const authenticatedFetch: typeof fetch = async (input, init = {}) => {
  const method = (
    init.method || (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  if (
    typeof window === "undefined" ||
    ["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    return fetch(input, { credentials: "include", ...init });
  }
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    window.location.href,
  );
  const apiOrigin = new URL(API_URL, window.location.href).origin;
  if (url.origin !== apiOrigin)
    throw new Error("Untrusted session request origin");
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  );
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  headers.set("X-CSRFToken", await csrfToken());
  return fetch(input, { ...init, credentials: "include", headers });
};

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/zentinelle/v1";

export async function fetchSessionUser(
  cookieHeader?: string,
): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      credentials: "include",
      headers: {
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.user ?? null;
  } catch {
    return null;
  }
}

export async function login(
  username: string,
  password: string,
): Promise<{ user: SessionUser; csrf_token: string } | { error: string }> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { error: data.error || "Login failed" };
  }

  return data;
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

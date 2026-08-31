import { redirect } from "next/navigation";
import { cookies } from "next/headers";

// "local", not "open" — see the note in app/(app)/layout.tsx. Defaulting to
// open sent every deployment's root straight to /dashboard, so the console had
// no reachable login page at all.
const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || "local";

export default async function RootPage() {
  // Open mode: skip auth entirely
  if (AUTH_MODE === "open") {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has("zentinelle_session") || cookieStore.has("sessionid");

  if (hasSession) {
    redirect("/dashboard");
  } else {
    redirect("/auth/login");
  }
}

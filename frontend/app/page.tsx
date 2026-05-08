import { redirect } from "next/navigation";
import { cookies } from "next/headers";

const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || "open";

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

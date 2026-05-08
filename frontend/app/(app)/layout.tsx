import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { ChatBubble } from "@/components/ChatBubble";
import type { SessionUser } from "@/lib/auth/session";

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL || "http://backend:8000/api/zentinelle/v1";

const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || "open";

const OPEN_MODE_USER: SessionUser = {
  id: "0",
  username: "admin",
  email: "",
  is_staff: true,
  is_superuser: true,
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Open mode: skip auth entirely
  if (AUTH_MODE === "open") {
    return (
      <SidebarProvider>
        <AppSidebar ssrUser={OPEN_MODE_USER} />
        <SidebarInset>
          <PageHeader />
          {children}
        </SidebarInset>
        <ChatBubble />
      </SidebarProvider>
    );
  }

  // Local / SSO mode: check session cookie
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has("zentinelle_session") || cookieStore.has("sessionid");

  if (!hasSession) {
    redirect("/auth/login");
  }

  let ssrUser: SessionUser | null = null;

  try {
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const res = await fetch(`${INTERNAL_API_URL}/auth/me`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      ssrUser = data.user ?? null;
    }
  } catch {
    // Network error — let client-side handle
  }

  if (!ssrUser) {
    redirect("/auth/login");
  }

  return (
    <SidebarProvider>
      <AppSidebar ssrUser={ssrUser} />
      <SidebarInset>
        <PageHeader />
        {children}
      </SidebarInset>
      <ChatBubble />
    </SidebarProvider>
  );
}

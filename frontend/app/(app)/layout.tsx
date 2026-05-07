import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { fetchSessionUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    ssrUser = await fetchSessionUser(cookieHeader);
  } catch {
    // Network error fetching user info -- let the page render
    // and the client-side will handle re-authentication if needed
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
    </SidebarProvider>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth/session";

export default function LogoutButton() {
  const handleLogout = async () => {
    await logout();
    window.location.href = "/auth/login";
  };

  return (
    <Button variant="outline" onClick={handleLogout}>
      Log out
    </Button>
  );
}

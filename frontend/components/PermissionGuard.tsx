"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/lib/auth/session";

const Capabilities = createContext<readonly string[]>([]);

export function CapabilityProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <Capabilities.Provider value={user.capabilities || []}>
      {children}
    </Capabilities.Provider>
  );
}

export function useCapability(permission: string): boolean {
  return useContext(Capabilities).includes(permission);
}

export function PermissionGuard({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  return useCapability(permission) ? <>{children}</> : null;
}

export function withPermissionAuthenticationRequired<T extends object>(
  WrappedComponent: React.ComponentType<T>,
  permission: string,
): React.FC<T> {
  const GuardedComponent: React.FC<T> = (props: T) => {
    const allowed = useCapability(permission);
    if (!allowed)
      return (
        <div className="p-6" role="status">
          <h1 className="text-xl font-semibold">Access required</h1>
          <p className="text-muted-foreground mt-2">
            Your account does not have permission to use this page.
          </p>
        </div>
      );
    return <WrappedComponent {...props} />;
  };
  GuardedComponent.displayName = `PermissionGuard(${WrappedComponent.displayName ?? WrappedComponent.name ?? "Component"})`;
  return GuardedComponent;
}

"use client";

import { Loader2Icon } from "lucide-react";

type PermissionGuardProps = {
  permission: string;
  children: React.ReactNode;
};

export function PermissionGuard({ children }: PermissionGuardProps) {
  return <>{children}</>;
}

export function withPermissionAuthenticationRequired<T extends object>(
  WrappedComponent: React.ComponentType<T>,
  _permission: string,
): React.FC<T> {
  const GuardedComponent: React.FC<T> = (props: T) => (
    <WrappedComponent {...props} />
  );
  GuardedComponent.displayName = `withPermissionAuthenticationRequired(${WrappedComponent.displayName ?? WrappedComponent.name ?? "Component"})`;
  return GuardedComponent;
}

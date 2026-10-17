import { ErrorState, LoadingState } from "@calliopelabs/ui";
import type * as React from "react";

import type { Loadable } from "./model";

export interface LoadedProps<T> {
  /** Names what loads, in the loading and error copy ("organization settings"). */
  label: string;
  value: Loadable<T>;
  children: (data: T) => React.ReactNode;
}

/** One query's states for a settings tab: skeleton, inline error with retry, then the content. */
export function Loaded<T>({ label, value, children }: LoadedProps<T>) {
  if (value.error)
    return (
      <ErrorState
        title={`Could not load ${label}`}
        error={value.error}
        onRetry={value.retry}
      />
    );
  if (value.loading || value.data === null)
    return <LoadingState label={`Loading ${label}`} rows={4} />;
  return <>{children(value.data)}</>;
}

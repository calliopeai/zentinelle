import * as React from "react";

/**
 * The mutation contract, enforced on the client (audit M1 and M3): a
 * payload whose `success` is false, or whose `errors` is not empty, is a
 * failure, and its message reaches the person. Never a success toast for a
 * change the server refused.
 */
export interface MutationPayload {
  success?: boolean | null;
  error?: string | null;
  errors?: readonly string[] | null;
}

export function payloadOrThrow<T extends MutationPayload>(
  payload: T | null | undefined,
  fallback: string,
): T {
  if (!payload) throw new Error(fallback);
  if (payload.errors?.length) throw new Error(payload.errors.join(" "));
  if (payload.success === false) throw new Error(payload.error || fallback);
  return payload;
}

/** Search waits for the person to pause before it becomes a query variable. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

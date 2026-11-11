import { StatusBadge } from "@calliopelabs/ui";

import { ENFORCEMENT_LABEL, ENFORCEMENT_TONE } from "./labels";

/**
 * A policy's state in one badge: off, or its enforcement mode. A policy
 * that is turned off reads "Off" whatever its mode, since nothing applies it.
 */
export function PolicyStatus({
  enabled,
  enforcement,
}: {
  enabled: boolean;
  enforcement: string;
}) {
  if (!enabled) return <StatusBadge tone="muted">Off</StatusBadge>;
  return (
    <StatusBadge tone={ENFORCEMENT_TONE[enforcement] ?? "muted"}>
      {ENFORCEMENT_LABEL[enforcement] ?? enforcement}
    </StatusBadge>
  );
}

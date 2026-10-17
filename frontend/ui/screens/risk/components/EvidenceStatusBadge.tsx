import { StatusBadge } from "@calliopelabs/ui";

import { EVIDENCE_LABEL, EVIDENCE_TONE } from "../model";

/**
 * A control's evidence state. Only "verified operating" is green: a mapping
 * with no evidence reads as unverified, never as met.
 */
export function EvidenceStatusBadge({ status }: { status: string | null }) {
  const key = status ?? "unknown";
  return (
    <StatusBadge tone={EVIDENCE_TONE[key] ?? "muted"}>
      {EVIDENCE_LABEL[key] ?? key}
    </StatusBadge>
  );
}

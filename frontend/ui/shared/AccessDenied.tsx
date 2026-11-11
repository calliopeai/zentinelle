import { EmptyState } from "@calliopelabs/ui";
import { LockIcon } from "lucide-react";

export interface AccessDeniedProps {
  /** What the page is ("Providers"). */
  what: string;
  /** The role it needs ("admin"). */
  role: string;
  homeHref?: string;
  homeLabel?: string;
}

/**
 * What a route answers a role that may not open it (ui-overhaul-ia §6 step 8:
 * a clean 403, never an empty page). The sidebar already hides the row; this
 * covers a typed or shared URL.
 */
export function AccessDenied({
  what,
  role,
  homeHref = "/dashboard",
  homeLabel = "Back to Overview",
}: AccessDeniedProps) {
  return (
    <EmptyState
      icon={<LockIcon />}
      title={`${what} needs the ${role} role`}
      description={`Your role cannot open ${what}. Ask an organization admin if you need it.`}
      actionHref={homeHref}
      actionLabel={homeLabel}
    />
  );
}

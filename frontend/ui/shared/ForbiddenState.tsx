/**
 * A page the signed-in role may not open: a clean 403 rather than an empty
 * page or a raw error (ui-overhaul-ia §6, step 8). The nav already hides the
 * row; this is for a deep link or a bookmark. Candidate for the package,
 * beside EmptyState and ErrorState.
 */
import { EmptyState } from "@calliopelabs/ui";
import { LockIcon } from "lucide-react";

export interface ForbiddenStateProps {
  title?: string;
  /** Who can open it, and how to get access. */
  description?: string;
  homeHref?: string;
  homeLabel?: string;
}

export function ForbiddenState({
  title = "You do not have access to this page",
  description = "Ask an admin in your organization for access.",
  homeHref = "/dashboard",
  homeLabel = "Back to Overview",
}: ForbiddenStateProps) {
  return (
    <EmptyState
      icon={<LockIcon aria-hidden className="size-6" />}
      title={title}
      description={description}
      actionHref={homeHref}
      actionLabel={homeLabel}
    />
  );
}

import { EmptyState } from "@calliopelabs/ui";
import { LockIcon } from "lucide-react";

export interface AccessStateProps {
  /** What is out of reach ("Evidence"). */
  subject: string;
  /** The role that opens it. */
  role?: string;
  homeHref?: string;
  homeLabel?: string;
}

/**
 * The clean 403: a signed-in person reached a page their role cannot open
 * (an old link, a shared URL). Says which role opens it and offers a way
 * out, instead of an empty page or a raw error. A candidate for
 * @calliopelabs/ui.
 */
export function AccessState({
  subject,
  role = "admin",
  homeHref = "/dashboard",
  homeLabel = "Back to Overview",
}: AccessStateProps) {
  return (
    <EmptyState
      icon={<LockIcon className="size-5 text-muted-foreground" aria-hidden />}
      title={`${subject} needs the ${role} role`}
      description={`Your role cannot open ${subject}. An ${role} in your organization can open it, or change your role.`}
      actionHref={homeHref}
      actionLabel={homeLabel}
    />
  );
}

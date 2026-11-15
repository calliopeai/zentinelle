import { EmptyState } from "@calliopelabs/ui";
import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";

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
  homeLabel,
}: AccessDeniedProps) {
  const t = useTranslations("common.accessDenied");
  return (
    <EmptyState
      icon={<LockIcon />}
      title={t("title", { what, role })}
      description={t("description", { what })}
      actionHref={homeHref}
      actionLabel={homeLabel ?? t("home")}
    />
  );
}

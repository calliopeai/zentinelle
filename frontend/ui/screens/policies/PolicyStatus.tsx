import { StatusBadge } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import { ENFORCEMENT_TONE, usePolicyLabels } from "./labels";

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
  const t = useTranslations("policies.policyStatus");
  const { enforcementLabel } = usePolicyLabels();
  if (!enabled) return <StatusBadge tone="muted">{t("off")}</StatusBadge>;
  return (
    <StatusBadge tone={ENFORCEMENT_TONE[enforcement] ?? "muted"}>
      {enforcementLabel(enforcement)}
    </StatusBadge>
  );
}

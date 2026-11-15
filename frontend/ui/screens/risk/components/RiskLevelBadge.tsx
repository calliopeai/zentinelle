import { StatusBadge } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import { RISK_LEVEL_TONE, labelOf, useRiskLabels } from "../model";

export interface RiskLevelBadgeProps {
  level: string | null;
  /** The RPN (severity x likelihood x impact, 1 to 512), beside the level. */
  score?: number | null;
}

/** A risk's level in words and colour, with its RPN when known. */
export function RiskLevelBadge({ level, score }: RiskLevelBadgeProps) {
  const t = useTranslations("risk.riskLevelBadge");
  const { RISK_LEVELS } = useRiskLabels();
  const label = labelOf(RISK_LEVELS, level) ?? t("unscored");
  return (
    <StatusBadge tone={level ? (RISK_LEVEL_TONE[level] ?? "muted") : "muted"}>
      {score != null ? `${label} ${score}` : label}
    </StatusBadge>
  );
}

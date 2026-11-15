/**
 * Budget showback: REST `GET /budgets/showback?group_by=` (the shape
 * frontend/app/(app)/budgets/showback reads). A budget is a `budget_limit`
 * policy, edited in Policies; this is the spend against it.
 */
import { useTranslations } from "next-intl";
export const SHOWBACK_GROUP_VALUES = [
  "endpoint",
  "team",
  "app",
  "session",
  "task",
] as const;

export type ShowbackGroup = (typeof SHOWBACK_GROUP_VALUES)[number];

/** The showback groupings, named under `models.labels.groups`. */
export function useBudgetLabels() {
  const t = useTranslations("models.labels");
  return {
    SHOWBACK_GROUPS: SHOWBACK_GROUP_VALUES.map((value) => ({
      value,
      label: t(`groups.${value}`),
    })),
  };
}

export type ShowbackStatus = "reconciled" | "unreconciled" | "anomaly";

export interface ShowbackEntry {
  dimension_id: string;
  requests: number;
  committed_usd: number;
  actual_usd: number | null;
  unreconciled_requests: number;
  anomaly: boolean;
  status: ShowbackStatus;
}

export interface ShowbackReport {
  entries: ShowbackEntry[];
  totals: { committed_usd: number; actual_usd: number | null };
  source: string;
}

export const BUDGET_POLICIES_HREF = "/policies?type=budget_limit";

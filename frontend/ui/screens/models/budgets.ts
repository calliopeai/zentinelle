/**
 * Budget showback: REST `GET /budgets/showback?group_by=` (the shape
 * frontend/app/(app)/budgets/showback reads). A budget is a `budget_limit`
 * policy, edited in Policies; this is the spend against it.
 */
export const SHOWBACK_GROUPS = [
  { value: "endpoint", label: "Agent" },
  { value: "team", label: "Team" },
  { value: "app", label: "App" },
  { value: "session", label: "Session" },
  { value: "task", label: "Task" },
] as const;

export type ShowbackGroup = (typeof SHOWBACK_GROUPS)[number]["value"];

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

import { authenticatedFetch } from "@/lib/auth/fetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HeldApproval {
  request_id: string;
  agent_id: string;
  user_id: string | null;
  action: string;
  context: Record<string, unknown>;
  reason: string;
  trace_id: string;
  expires_at: string;
  created_at: string;
}

export async function listApprovals(
  signal?: AbortSignal,
): Promise<HeldApproval[]> {
  const response = await authenticatedFetch(`${API_URL}/approvals/requests`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Your session cannot view approvals. Sign in with an authorized account."
        : "Approvals could not be refreshed. Decisions are disabled until a refresh succeeds.",
    );
  const data = await response.json();
  if (
    !Array.isArray(data.requests) ||
    data.requests.length > 100 ||
    data.requests.some(
      (row: HeldApproval) =>
        !row ||
        typeof row.request_id !== "string" ||
        !UUID.test(row.request_id) ||
        typeof row.agent_id !== "string" ||
        typeof row.action !== "string" ||
        !(row.user_id === null || typeof row.user_id === "string") ||
        typeof row.reason !== "string" ||
        typeof row.trace_id !== "string" ||
        !row.context ||
        typeof row.context !== "object" ||
        Array.isArray(row.context) ||
        typeof row.expires_at !== "string" ||
        !Number.isFinite(Date.parse(row.expires_at)) ||
        typeof row.created_at !== "string" ||
        !Number.isFinite(Date.parse(row.created_at)),
    )
  )
    throw new Error(
      "The approval response was invalid. Decisions are disabled until a refresh succeeds.",
    );
  return data.requests.sort(
    (a: HeldApproval, b: HeldApproval) =>
      Date.parse(b.created_at) - Date.parse(a.created_at),
  );
}

export async function decideApproval(
  requestId: string,
  decision: "approve" | "deny",
  reason: string,
): Promise<void> {
  if (!UUID.test(requestId) || reason.length > 1000)
    throw new Error("Invalid approval decision.");
  const response = await authenticatedFetch(
    `${API_URL}/approvals/requests/${requestId}/decision`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    },
  );
  if (response.status === 409 || response.status === 404)
    throw new Error(
      "This request has expired, was already decided, or is no longer available. Refresh the inbox.",
    );
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "Your session cannot decide approvals. An operator or administrator is required.",
    );
  if (!response.ok)
    throw new Error(
      "The decision could not be confirmed. Refresh before trying again.",
    );
  const data = await response.json();
  if (
    data.request_id !== requestId ||
    data.status !== (decision === "approve" ? "approved" : "denied")
  )
    throw new Error(
      "The decision could not be confirmed. Refresh before trying again.",
    );
}

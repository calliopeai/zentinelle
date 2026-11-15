import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  areaSwitcher,
} from "@calliopelabs/ui";
import { ClipboardCheckIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { HeldApproval } from "@/lib/approvals";

import { navFor } from "../../product";
import { ApprovalCard } from "./ApprovalCard";

export interface ApprovalsScreenProps {
  /** GET /approvals/requests, newest first; at most 100. */
  requests: readonly HeldApproval[];
  /** The first load, or a refresh in flight. */
  loading: boolean;
  /** The last refresh or decision failed; decisions stay held until a refresh succeeds. */
  error: string;
  /** The last decision, confirmed by the server. */
  notice: string;
  /** The request whose decision is saving. */
  busyId: string | null;
  now: number;
  capabilities: readonly string[];
  reasons: Readonly<Record<string, string>>;
  onReasonChange: (requestId: string, reason: string) => void;
  onDecide: (request: HeldApproval, decision: "approve" | "deny") => void;
  onRefresh: () => void;
}

/**
 * Approvals (ui-overhaul-ia §4.1, from #440): agent actions that policy
 * held for a person. Viewers read them; operators approve or deny each
 * exact request. The route refreshes every 15 seconds and never retries a
 * decision on its own.
 */
export function ApprovalsScreen({
  requests,
  loading,
  error,
  notice,
  busyId,
  now,
  capabilities,
  reasons,
  onReasonChange,
  onDecide,
  onRefresh,
}: ApprovalsScreenProps) {
  const t = useTranslations("agents.approvals");
  const canDecide = capabilities.includes("mutate");
  const first = loading && requests.length === 0 && !error;
  return (
    <PageFrame
      crumbs={[areaSwitcher(navFor(capabilities), "agents", "approvals")]}
      title={t("title")}
      description={t("description")}
      primaryAction={
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={loading || busyId !== null}
        >
          <RefreshCwIcon aria-hidden />
          {loading ? t("refreshing") : t("refresh")}
        </Button>
      }
      notice={
        !canDecide ? (
          <p className="rounded-lg border p-3 text-sm">{t("viewOnly")}</p>
        ) : notice ? (
          <p
            role="status"
            className="rounded-lg border p-3 text-sm [overflow-wrap:anywhere]"
          >
            {notice}
          </p>
        ) : undefined
      }
    >
      {error ? (
        <ErrorState
          title={t("error")}
          error={error}
          onRetry={onRefresh}
          retryLabel={t("refresh")}
        />
      ) : first ? (
        <LoadingState label={t("loading")} rows={3} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheckIcon />}
          title={t("empty.title")}
          description={t("empty.description")}
          learnMoreHref="/policies?type=human_oversight"
          learnMoreLabel={t("empty.learnMore")}
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {t("count", { count: requests.length })}
            {requests.length === 100 ? t("newest") : ""}
          </p>
          <div
            className="flex flex-col gap-4"
            aria-busy={loading || busyId !== null}
          >
            {requests.map((request) => (
              <ApprovalCard
                key={request.request_id}
                request={request}
                now={now}
                canDecide={canDecide}
                locked={loading || busyId !== null}
                saving={busyId === request.request_id}
                reason={reasons[request.request_id] ?? ""}
                onReasonChange={(reason) =>
                  onReasonChange(request.request_id, reason)
                }
                onDecide={(decision) => onDecide(request, decision)}
              />
            ))}
          </div>
        </>
      )}
    </PageFrame>
  );
}

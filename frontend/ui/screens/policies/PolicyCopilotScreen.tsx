import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  Section,
  StatusBadge,
  useUI,
} from "@calliopelabs/ui";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type * as React from "react";

import { CodeBlock } from "../../shared/CodeBlock";
import { Field } from "../../shared/Field";
import { Select } from "../../shared/Select";
import { Textarea } from "../../shared/Textarea";
import { accessOf } from "./access";
import { StatTile } from "./components/StatTile";
import { areaCrumb } from "./frame";
import { CHANGE_STATUS_TONE, usePolicyLabels } from "./labels";
import type { CopilotPreview } from "./writes";

/** The next step a staged change takes from each status, and whether it needs an administrator. */
const NEXT: Record<string, { to: string; admin: boolean } | undefined> = {
  draft: { to: "validated", admin: false },
  validated: { to: "staged", admin: false },
  staged: { to: "approved", admin: true },
  approved: { to: "promoted", admin: true },
};

export interface PolicyCopilotScreenProps {
  capabilities: readonly string[];
  /** REST `policy-copilot/status`: loading, on, off (with the server's reason), or failed. */
  status: "loading" | "enabled" | "disabled" | "error";
  statusReason?: string | null;
  onRetryStatus?: () => void;
  request: string;
  onRequestChange: (request: string) => void;
  /** The live policy to compare against; "" drafts a new one. */
  policyId: string;
  onPolicyIdChange: (id: string) => void;
  policies: readonly { id: string; name: string }[];
  /** `draft`, then `diff`: the plain-language request as a reviewed preview. */
  onPreview: () => void;
  previewing: boolean;
  preview: CopilotPreview | null;
  /** The last failed step's message. */
  error?: { message: string } | null;
  /** `stage`: the preview becomes a change set in the reviewed workflow. */
  onStage: () => void;
  staging: boolean;
  staged: { id: string; status: string } | null;
  /** `policy-changes/{id}/transition`. */
  onTransition: (to: string) => void;
}

/**
 * Policies > Copilot: describe a policy change in plain language, review the
 * draft against the live policy and its replay over the last 7 days, then
 * stage it. Live policies change only through the reviewed workflow.
 */
export function PolicyCopilotScreen({
  capabilities,
  status,
  statusReason,
  onRetryStatus,
  request,
  onRequestChange,
  policyId,
  onPolicyIdChange,
  policies,
  onPreview,
  previewing,
  preview,
  error,
  onStage,
  staging,
  staged,
  onTransition,
}: PolicyCopilotScreenProps) {
  const t = useTranslations("policies.copilot");
  const { changeStatusLabel, transitionLabel } = usePolicyLabels();
  const { Link } = useUI();
  const { canEdit, canAdmin } = accessOf(capabilities);
  const busy = previewing || staging;

  let body: React.ReactNode;
  if (status === "loading") {
    body = <LoadingState label={t("loading")} variant="page" />;
  } else if (status === "error") {
    body = (
      <ErrorState
        title={t("statusError")}
        error={error}
        onRetry={onRetryStatus}
      />
    );
  } else if (status === "disabled") {
    body = (
      <EmptyState
        icon={<SparklesIcon />}
        title={t("disabled.title")}
        description={statusReason || t("disabled.description")}
        actionHref={canAdmin ? "/settings/assistant" : undefined}
        actionLabel={canAdmin ? t("disabled.action") : undefined}
      />
    );
  } else if (!canEdit) {
    body = (
      <EmptyState
        icon={<SparklesIcon />}
        title={t("readOnly.title")}
        description={t("readOnly.description")}
        actionHref="/policies"
        actionLabel={t("readOnly.action")}
      />
    );
  } else {
    const sim = preview?.simulation ?? null;
    const next = staged ? NEXT[staged.status] : undefined;
    body = (
      <div className="flex flex-col gap-6">
        <Section title={t("ask.title")} description={t("ask.description")}>
          <form
            className="flex max-w-2xl flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (request.trim() && !busy) onPreview();
            }}
          >
            <Field label={t("ask.request")} hint={t("ask.requestHint")}>
              {(control) => (
                <Textarea
                  {...control}
                  rows={3}
                  value={request}
                  placeholder={t("ask.placeholder")}
                  onChange={(e) => onRequestChange(e.target.value)}
                />
              )}
            </Field>
            <Field label={t("ask.policy")} hint={t("ask.policyHint")}>
              {(control) => (
                <Select
                  {...control}
                  value={policyId}
                  onValueChange={onPolicyIdChange}
                  options={[
                    { value: "", label: t("ask.newPolicy") },
                    ...policies.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              )}
            </Field>
            <div>
              <Button type="submit" disabled={busy || !request.trim()}>
                {previewing ? t("ask.previewing") : t("ask.preview")}
              </Button>
            </div>
          </form>
        </Section>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg [overflow-wrap:anywhere]"
          >
            {error.message}
          </p>
        )}
        {preview && (
          <Section
            title={t("review.title")}
            description={t("review.description")}
            action={
              staged ? undefined : (
                <Button size="sm" onClick={onStage} disabled={busy}>
                  {staging ? t("review.staging") : t("review.stage")}
                </Button>
              )
            }
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile
                label={t("review.agents")}
                value={preview.impacted_agent_count.toLocaleString()}
              />
              <StatTile
                label={t("review.events")}
                value={(sim?.total_events ?? 0).toLocaleString()}
              />
              <StatTile
                label={t("review.wouldBlock")}
                value={(sim?.would_block ?? 0).toLocaleString()}
                tone={sim?.would_block ? "error" : undefined}
              />
              <StatTile
                label={t("review.inconclusive")}
                value={(sim?.inconclusive ?? 0).toLocaleString()}
              />
            </div>
            <p className="mt-4 text-sm">
              {preview.changed_fields.length
                ? t("review.changed", {
                    fields: preview.changed_fields.join(", "),
                  })
                : t("review.unchanged")}
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {preview.policy_id && (
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-muted-foreground">
                    {t("review.before")}
                  </p>
                  <CodeBlock
                    label={t("review.before")}
                    value={preview.before}
                  />
                </div>
              )}
              <div className="min-w-0">
                <p className="mb-1 text-xs text-muted-foreground">
                  {t("review.after")}
                </p>
                <CodeBlock label={t("review.after")} value={preview.after} />
              </div>
            </div>
          </Section>
        )}
        {staged && (
          <Section title={t("staged.title")}>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                {t.rich("staged.change", {
                  id: staged.id,
                  code: (chunks) => <code className="font-mono">{chunks}</code>,
                })}
              </span>
              <StatusBadge tone={CHANGE_STATUS_TONE[staged.status] ?? "muted"}>
                {changeStatusLabel(staged.status)}
              </StatusBadge>
              {next && (!next.admin || canAdmin) && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => onTransition(next.to)}
                >
                  {transitionLabel(next.to)}
                </Button>
              )}
              {next?.admin && !canAdmin && (
                <span className="text-muted-foreground">
                  {t("staged.needsAdmin")}
                </span>
              )}
              <Link
                href={`/policies/changes?change=${encodeURIComponent(staged.id)}`}
                className="underline underline-offset-2"
              >
                {t("staged.open")}
              </Link>
            </div>
          </Section>
        )}
      </div>
    );
  }

  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "policies", "/policies")]}
      title={t("title")}
      description={t("description")}
    >
      {body}
    </PageFrame>
  );
}

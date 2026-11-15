import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  Section,
  StatusBadge,
  useUI,
  DefinitionList,
  Panel,
} from "@calliopelabs/ui";
import { MoreHorizontalIcon } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";

import type { RiskData } from "@/graphql/risks/types";

import { RiskLevelBadge } from "./components/RiskLevelBadge";
import {
  RISK_STATUS_TONE,
  areaCrumb,
  canMutate,
  formatDate,
  formatDateTime,
  labelOf,
  type QueryState,
  useRiskLabels,
} from "./model";

export interface RiskDetailScreenProps extends QueryState {
  capabilities: readonly string[];
  /** `GetRisk`; `null` once loaded means there is no such risk. */
  risk: RiskData | null;
  /** `ReviewRisk`. */
  onReview?: () => Promise<unknown> | unknown;
  reviewing?: boolean;
  /** `DeleteRisk`; the route returns to the register after it. */
  onDelete?: () => Promise<unknown> | unknown;
}

const scaleText = (
  scale: readonly { value: number; label: string }[],
  value: number | null,
) => (value == null ? null : `${labelOf(scale, value)} (${value})`);

/**
 * One risk: its assessment before and after mitigation, the plan, and its
 * review cycle. Mark reviewed is the one primary action; Edit and Delete sit
 * in the menu, for people who can change risks.
 */
export function RiskDetailScreen({
  capabilities,
  risk,
  onReview,
  reviewing = false,
  onDelete,
  loading,
  error,
  onRetry,
}: RiskDetailScreenProps) {
  const t = useTranslations("risk.riskDetailScreen");
  const { IMPACT, LIKELIHOOD, RISK_CATEGORIES, RISK_STATUSES } =
    useRiskLabels();
  const { Link } = useUI();
  const [confirming, setConfirming] = React.useState(false);
  const editable = canMutate(capabilities);
  const crumbs = [
    areaCrumb("risks", capabilities),
    { label: t("register"), href: "/risks" },
  ];

  if (loading)
    return (
      <PageFrame crumbs={crumbs} title={t("risk")}>
        <LoadingState variant="page" label={t("loadingTheRisk")} />
      </PageFrame>
    );
  if (error)
    return (
      <PageFrame crumbs={crumbs} title={t("risk")}>
        <ErrorState
          title={t("couldNotLoadTheRisk")}
          error={error}
          onRetry={onRetry}
        />
      </PageFrame>
    );
  if (!risk)
    return (
      <PageFrame crumbs={crumbs} title={t("riskNotFound")}>
        <EmptyState
          title={t("thisRiskIsNotIn")}
          description={t("itWasDeletedOrThe")}
          actionHref="/risks"
          actionLabel={t("backToTheRegister")}
        />
      </PageFrame>
    );

  const residualSet =
    risk.residualLikelihood != null && risk.residualImpact != null;
  const notAssessed = (
    <span className="text-muted-foreground">{t("notAssessed")}</span>
  );
  return (
    <PageFrame
      crumbs={crumbs}
      title={<span className="[overflow-wrap:anywhere]">{risk.name}</span>}
      status={
        <StatusBadge tone={RISK_STATUS_TONE[risk.status] ?? "muted"}>
          {risk.statusDisplay ?? labelOf(RISK_STATUSES, risk.status)}
        </StatusBadge>
      }
      context={risk.categoryDisplay ?? labelOf(RISK_CATEGORIES, risk.category)}
      primaryAction={
        editable ? (
          <Button onClick={() => void onReview?.()} disabled={reviewing}>
            {reviewing ? t("markingReviewed") : t("markReviewed")}
          </Button>
        ) : undefined
      }
      menu={
        editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("moreActions")}
              >
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/risks/${risk.id}?edit=1`}>{t("edit")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirming(true)}
              >
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
    >
      {risk.description && (
        <p className="max-w-prose text-sm [overflow-wrap:anywhere] text-muted-foreground">
          {risk.description}
        </p>
      )}
      <Section title={t("assessment")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title={t("inherent")}
            actions={
              <RiskLevelBadge level={risk.riskLevel} score={risk.riskScore} />
            }
          >
            <DefinitionList
              items={[
                {
                  term: t("likelihood"),
                  description: scaleText(LIKELIHOOD, risk.likelihood),
                },
                {
                  term: t("impact"),
                  description: scaleText(IMPACT, risk.impact),
                },
                { term: "RPN", description: risk.riskScore },
              ]}
            />
          </Panel>
          <Panel title={t("residualAfterMitigation")}>
            <DefinitionList
              items={[
                {
                  term: t("likelihood"),
                  description:
                    scaleText(LIKELIHOOD, risk.residualLikelihood) ??
                    notAssessed,
                },
                {
                  term: t("impact"),
                  description:
                    scaleText(IMPACT, risk.residualImpact) ?? notAssessed,
                },
                {
                  term: t("score"),
                  description: residualSet
                    ? t("residual", { score: risk.residualRiskScore ?? "" })
                    : notAssessed,
                },
              ]}
            />
          </Panel>
        </div>
      </Section>
      <Section title={t("mitigationAndReview")}>
        <DefinitionList
          columns={2}
          items={[
            { term: t("plan"), description: risk.mitigationPlan || null },
            { term: t("progress"), description: risk.mitigationStatus || null },
            { term: t("owner"), description: risk.ownerName },
            {
              term: t("lastReviewed"),
              description: formatDateTime(risk.lastReviewedAt) ?? t("never"),
            },
            {
              term: t("nextReview"),
              description: formatDate(risk.nextReviewDate),
            },
            {
              term: t("identified"),
              description: formatDate(risk.identifiedAt),
            },
            {
              term: t("incidents"),
              description: risk.incidentCount ? (
                <Link
                  href={`/incidents?search=${encodeURIComponent(risk.name)}`}
                  className="underline underline-offset-2"
                >
                  {risk.incidentCount} linked
                </Link>
              ) : (
                t("noneLinked")
              ),
            },
            {
              term: t("tags"),
              description: risk.tags.length ? (
                <span className="flex flex-wrap gap-1">
                  {risk.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border px-2 py-0.5 font-mono text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              ) : null,
            },
          ]}
        />
      </Section>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        title={t("deleteThisRisk")}
        description={t("theRiskLeavesTheRegister")}
        confirmLabel={t("deleteRisk")}
        onConfirm={() => onDelete?.()}
      />
    </PageFrame>
  );
}

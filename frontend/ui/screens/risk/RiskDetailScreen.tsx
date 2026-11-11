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
} from "@calliopelabs/ui";
import { MoreHorizontalIcon } from "lucide-react";
import * as React from "react";

import type { RiskData } from "@/graphql/risks/types";

import { Card } from "../../patterns/Card";
import { DefinitionList } from "../../patterns/DefinitionList";
import { RiskLevelBadge } from "./components/RiskLevelBadge";
import {
  IMPACT,
  LIKELIHOOD,
  RISK_CATEGORIES,
  RISK_STATUSES,
  RISK_STATUS_TONE,
  areaCrumb,
  canMutate,
  formatDate,
  formatDateTime,
  labelOf,
  type QueryState,
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
  scale: typeof LIKELIHOOD | typeof IMPACT,
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
  const { Link } = useUI();
  const [confirming, setConfirming] = React.useState(false);
  const editable = canMutate(capabilities);
  const crumbs = [
    areaCrumb("risks", capabilities),
    { label: "Register", href: "/risks" },
  ];

  if (loading)
    return (
      <PageFrame crumbs={crumbs} title="Risk">
        <LoadingState variant="page" label="Loading the risk" />
      </PageFrame>
    );
  if (error)
    return (
      <PageFrame crumbs={crumbs} title="Risk">
        <ErrorState
          title="Could not load the risk"
          error={error}
          onRetry={onRetry}
        />
      </PageFrame>
    );
  if (!risk)
    return (
      <PageFrame crumbs={crumbs} title="Risk not found">
        <EmptyState
          title="This risk is not in the register"
          description="It was deleted, or the link is wrong."
          actionHref="/risks"
          actionLabel="Back to the register"
        />
      </PageFrame>
    );

  const residualSet =
    risk.residualLikelihood != null && risk.residualImpact != null;
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
            {reviewing ? "Marking reviewed" : "Mark reviewed"}
          </Button>
        ) : undefined
      }
      menu={
        editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/risks/${risk.id}?edit=1`}>Edit</Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirming(true)}
              >
                Delete
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
      <Section title="Assessment">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Inherent"
            action={
              <RiskLevelBadge level={risk.riskLevel} score={risk.riskScore} />
            }
          >
            <DefinitionList
              items={[
                {
                  term: "Likelihood",
                  description: scaleText(LIKELIHOOD, risk.likelihood),
                },
                { term: "Impact", description: scaleText(IMPACT, risk.impact) },
                { term: "RPN", description: risk.riskScore },
              ]}
            />
          </Card>
          <Card title="Residual, after mitigation">
            <DefinitionList
              emptyLabel="Not assessed"
              items={[
                {
                  term: "Likelihood",
                  description: scaleText(LIKELIHOOD, risk.residualLikelihood),
                },
                {
                  term: "Impact",
                  description: scaleText(IMPACT, risk.residualImpact),
                },
                {
                  term: "Score",
                  description: residualSet
                    ? `${risk.residualRiskScore}, likelihood x impact. The server leaves severity out, so it does not compare with the RPN.`
                    : null,
                },
              ]}
            />
          </Card>
        </div>
      </Section>
      <Section title="Mitigation and review">
        <DefinitionList
          columns={2}
          items={[
            { term: "Plan", description: risk.mitigationPlan || null },
            { term: "Progress", description: risk.mitigationStatus || null },
            { term: "Owner", description: risk.ownerName },
            {
              term: "Last reviewed",
              description: formatDateTime(risk.lastReviewedAt) ?? "Never",
            },
            {
              term: "Next review",
              description: formatDate(risk.nextReviewDate),
            },
            { term: "Identified", description: formatDate(risk.identifiedAt) },
            {
              term: "Incidents",
              description: risk.incidentCount ? (
                <Link
                  href={`/incidents?search=${encodeURIComponent(risk.name)}`}
                  className="underline underline-offset-2"
                >
                  {risk.incidentCount} linked
                </Link>
              ) : (
                "None linked"
              ),
            },
            {
              term: "Tags",
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
        title="Delete this risk?"
        description="The risk leaves the register. Incidents linked to it stay, without the link. This cannot be undone."
        confirmLabel="Delete risk"
        onConfirm={() => onDelete?.()}
      />
    </PageFrame>
  );
}

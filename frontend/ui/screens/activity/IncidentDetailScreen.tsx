import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageFrame,
  Section,
  StatusBadge,
  type TabNavItem,
  Textarea,
} from "@calliopelabs/ui";
import { DownloadIcon, MoreHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

import type { IncidentData } from "@/graphql/risks/types";

import { DefinitionList } from "./components/DefinitionList";
import { formatDuration, humanize } from "../../shared/format";
import type { ListSource } from "./components/list-controller";
import { StatTile } from "./components/StatTile";
import { Timeline, type TimelineEntry } from "../../shared/Timeline";
import { incidentHref } from "./IncidentsScreen";
import { activityCrumb } from "./nav";
import {
  INCIDENT_STATUS_TONE,
  SEVERITY_TONE,
  SLA_TONE,
  toneOf,
  useActivityLabels,
} from "./tones";
import type { IncidentComment } from "./types";

/** The incident's tabs (ui-overhaul-ia §4.2), each a path under `/incidents/{id}`. */
export type IncidentTab = "timeline" | "evidence" | "comments";

export interface IncidentDetailScreenProps {
  tab: IncidentTab;
  /** The incident, from the fields `GetIncidents` selects. Null while loading or when not found. */
  incident: IncidentData | null;
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** REST `incidents/{id}/comments/`. */
  comments: ListSource<IncidentComment>;
  /** A name for a comment's `author_id`; the endpoint sends only the id. Defaults to "User {id}". */
  authorName?: (authorId: string) => string;
  /** REST `incidents/{id}/evidence/`: the signed bundle, as a download. */
  evidenceHref: string;
  /** Operators and admins move an incident on and comment; viewers read. */
  canMutate: boolean;
  onAcknowledge?: () => void;
  /** Awaited with the resolution text; a rejection keeps the dialog open. */
  onResolve?: (resolution: string) => Promise<unknown> | void;
  onClose?: () => Promise<unknown> | void;
  /** Awaited; the box clears when it resolves. */
  onComment?: (body: string) => Promise<unknown> | void;
}

const TABS: { key: IncidentTab; path: string }[] = [
  { key: "timeline", path: "" },
  { key: "evidence", path: "/evidence" },
  { key: "comments", path: "/comments" },
];

const ACTIVE = new Set(["open", "investigating", "mitigating"]);

type Moment =
  "occurred" | "detected" | "acknowledged" | "resolved" | "closed" | "comment";

/** The incident's moments and its comments, oldest first; `title` names each kind. */
export function incidentTimeline(
  incident: IncidentData,
  comments: readonly IncidentComment[],
  authorName: (id: string) => string,
  title: (moment: Moment) => string,
): TimelineEntry[] {
  const moments: (TimelineEntry | null)[] = [
    incident.occurredAt
      ? {
          id: "occurred",
          at: incident.occurredAt,
          title: title("occurred"),
          tone: toneOf(SEVERITY_TONE, incident.severity),
        }
      : null,
    incident.detectedAt
      ? {
          id: "detected",
          at: incident.detectedAt,
          title: title("detected"),
          actor: incident.reportedByName ?? undefined,
          tone: "warn",
        }
      : null,
    incident.acknowledgedAt
      ? {
          id: "acknowledged",
          at: incident.acknowledgedAt,
          title: title("acknowledged"),
          actor: incident.assignedToName ?? undefined,
          tone: "info",
        }
      : null,
    incident.resolvedAt
      ? {
          id: "resolved",
          at: incident.resolvedAt,
          title: title("resolved"),
          body: incident.resolution ?? undefined,
          tone: "ok",
        }
      : null,
    incident.closedAt
      ? {
          id: "closed",
          at: incident.closedAt,
          title: title("closed"),
          tone: "muted",
        }
      : null,
  ];
  const notes: TimelineEntry[] = comments
    .filter((c) => c.created_at)
    .map((c) => ({
      id: `comment-${c.id}`,
      at: c.created_at as string,
      title: title("comment"),
      actor: authorName(c.author_id),
      body: c.body,
    }));
  return [
    ...moments.filter((m): m is TimelineEntry => m !== null),
    ...notes,
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function CommentBox({
  onComment,
}: {
  onComment: (body: string) => Promise<unknown> | void;
}) {
  const t = useTranslations("activity.incident");
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body.trim()) return;
        setPending(true);
        setError(null);
        try {
          await onComment(body.trim());
          setBody("");
        } catch (e) {
          setError(
            e instanceof Error && e.message ? e.message : t("commentFailed"),
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label={t("comments.add")}>
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {pending ? t("comments.posting") : t("comments.post")}
        </Button>
      </div>
    </form>
  );
}

function Comments({
  comments,
  authorName,
  canMutate,
  onComment,
}: Pick<IncidentDetailScreenProps, "comments" | "canMutate" | "onComment"> & {
  authorName: (id: string) => string;
}) {
  const t = useTranslations("activity.incident");
  if (comments.loading && comments.rows.length === 0)
    return <LoadingState label={t("comments.loading")} rows={2} />;
  if (comments.error && comments.rows.length === 0)
    return (
      <ErrorState
        title={t("comments.error")}
        error={comments.error}
        onRetry={comments.onRetry}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <Timeline
        label={t("comments.title")}
        emptyLabel={t("comments.empty")}
        entries={comments.rows
          .filter((c) => c.created_at)
          .map((c) => ({
            id: String(c.id),
            at: c.created_at as string,
            title: authorName(c.author_id),
            body: c.body,
          }))}
      />
      {canMutate && onComment && <CommentBox onComment={onComment} />}
    </div>
  );
}

/**
 * Activity > Incidents > one incident (new, ui-overhaul-ia §4.2): status,
 * owner and SLA in the header and summary, then Timeline, Evidence and
 * Comments as tabs. Acknowledge, resolve and close are the primary action
 * in turn; the evidence bundle downloads from the menu or its tab.
 */
export function IncidentDetailScreen({
  tab,
  incident,
  loading,
  error,
  onRetry,
  comments,
  authorName,
  evidenceHref,
  canMutate,
  onAcknowledge,
  onResolve,
  onClose,
  onComment,
}: IncidentDetailScreenProps) {
  const t = useTranslations("activity.incident");
  const tIncidents = useTranslations("activity.incidents");
  const labels = useActivityLabels();
  const nameOf = authorName ?? ((id: string) => t("comments.author", { id }));
  const [confirm, setConfirm] = React.useState<"resolve" | "close" | null>(
    null,
  );
  const crumbs = [
    activityCrumb("incidents"),
    { label: t("crumb"), href: "/incidents" },
  ];

  if (!incident) {
    return (
      <PageFrame
        crumbs={crumbs}
        title={loading || error ? t("title") : t("notFoundTitle")}
      >
        {loading ? (
          <LoadingState label={t("loading")} variant="page" />
        ) : error ? (
          <ErrorState title={t("error")} error={error} onRetry={onRetry} />
        ) : (
          <EmptyState
            title={t("notFound.title")}
            description={t("notFound.description")}
            actionHref="/incidents"
            actionLabel={t("notFound.action")}
          />
        )}
      </PageFrame>
    );
  }

  const base = incidentHref(incident);
  const tabs: TabNavItem[] = TABS.map((item) => ({
    key: item.key,
    label:
      item.key === "comments" && comments.rows.length
        ? t("tabs.commentsCount", { count: comments.rows.length })
        : t(`tabs.${item.key}`),
    href: `${base}${item.path}`,
    active: item.key === tab,
  }));
  const active = ACTIVE.has(incident.status);
  const primaryAction = !canMutate ? undefined : active &&
    !incident.acknowledgedAt ? (
    <Button size="sm" onClick={onAcknowledge}>
      {t("acknowledge")}
    </Button>
  ) : active ? (
    <Button size="sm" onClick={() => setConfirm("resolve")}>
      {t("resolve")}
    </Button>
  ) : incident.status === "resolved" ? (
    <Button size="sm" variant="outline" onClick={() => setConfirm("close")}>
      {t("close")}
    </Button>
  ) : undefined;

  return (
    <PageFrame
      crumbs={crumbs}
      title={<span className="break-words">{incident.title}</span>}
      status={
        <span className="flex flex-wrap gap-1.5">
          <StatusBadge tone={toneOf(SEVERITY_TONE, incident.severity)}>
            {incident.severityDisplay ?? humanize(incident.severity)}
          </StatusBadge>
          <StatusBadge tone={toneOf(INCIDENT_STATUS_TONE, incident.status)}>
            {incident.statusDisplay ?? humanize(incident.status)}
          </StatusBadge>
        </span>
      }
      context={incident.endpointName ?? undefined}
      description={incident.description || undefined}
      primaryAction={primaryAction}
      menu={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("actions")}>
              <MoreHorizontalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={evidenceHref} download>
                <DownloadIcon aria-hidden />
                {t("downloadEvidence")}
              </a>
            </DropdownMenuItem>
            {canMutate && active && incident.acknowledgedAt === null && (
              <DropdownMenuItem onSelect={() => setConfirm("resolve")}>
                {t("resolveDirect")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
      tabs={tabs}
      tabsLabel={t("tabsLabel")}
    >
      <Section title={t("summary")} headingLevel="h2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label={t("tta")}
            value={formatDuration(incident.timeToAcknowledgeSeconds)}
            hint={incident.acknowledgedAt ? undefined : t("notAcknowledged")}
          />
          <StatTile
            label={t("ttr")}
            value={formatDuration(incident.timeToResolveSeconds)}
            hint={incident.resolvedAt ? undefined : t("stillOpen")}
          />
          <StatTile
            label={t("sla")}
            value={
              incident.slaStatus
                ? labels.sla(incident.slaStatus)
                : humanize(null)
            }
            tone={
              incident.slaStatus
                ? toneOf(SLA_TONE, incident.slaStatus)
                : undefined
            }
          />
        </div>
        <DefinitionList
          className="mt-3"
          items={[
            {
              term: t("facts.type"),
              value:
                incident.incidentTypeDisplay ?? humanize(incident.incidentType),
            },
            { term: t("facts.agent"), value: incident.endpointName },
            {
              term: t("facts.policy"),
              value: incident.triggeringPolicyName,
            },
            { term: t("facts.risk"), value: incident.relatedRiskName },
            {
              term: t("facts.assignee"),
              value: incident.assignedToName ?? tIncidents("unassigned"),
            },
            { term: t("facts.reportedBy"), value: incident.reportedByName },
            {
              term: t("facts.affected"),
              value:
                incident.affectedUser ??
                (incident.affectedUserCount !== null
                  ? t("facts.affectedUsers", {
                      count: incident.affectedUserCount,
                    })
                  : null),
            },
            {
              term: t("facts.tags"),
              value: incident.tags.length ? incident.tags.join(", ") : null,
            },
          ]}
        />
      </Section>
      {tab === "timeline" && (
        <Section title={t("timeline.title")}>
          <Timeline
            label={t("timeline.label")}
            entries={incidentTimeline(incident, comments.rows, nameOf, (m) =>
              t(`timeline.${m}`),
            )}
          />
        </Section>
      )}
      {tab === "evidence" && (
        <Section
          title={t("evidence.title")}
          description={t("evidence.description")}
          action={
            <Button size="sm" variant="outline" asChild>
              <a href={evidenceHref} download>
                <DownloadIcon aria-hidden />
                {t("evidence.download")}
              </a>
            </Button>
          }
        >
          <DefinitionList
            columns={1}
            items={[
              { term: t("facts.rootCause"), value: incident.rootCause },
              { term: t("facts.impact"), value: incident.impactAssessment },
              { term: t("facts.resolution"), value: incident.resolution },
            ]}
          />
        </Section>
      )}
      {tab === "comments" && (
        <Section title={t("comments.title")}>
          <Comments
            comments={comments}
            authorName={nameOf}
            canMutate={canMutate}
            onComment={onComment}
          />
        </Section>
      )}
      <ConfirmDialog
        open={confirm === "resolve"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("resolveDialog.title")}
        description={t("resolveDialog.description")}
        confirmLabel={t("resolve")}
        reason={{
          label: t("resolveDialog.label"),
          placeholder: t("resolveDialog.placeholder"),
        }}
        onConfirm={(resolution) => onResolve?.(resolution)}
      />
      <ConfirmDialog
        open={confirm === "close"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("closeDialog.title")}
        description={t("closeDialog.description")}
        confirmLabel={t("closeDialog.confirm")}
        onConfirm={() => onClose?.()}
      />
    </PageFrame>
  );
}

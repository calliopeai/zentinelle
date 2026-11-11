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
  type TabNavItem,
} from "@calliopelabs/ui";
import { DownloadIcon, MoreHorizontalIcon } from "lucide-react";
import * as React from "react";

import type { IncidentData } from "@/graphql/risks/types";

import { DefinitionList } from "./components/DefinitionList";
import { formatDuration, humanize } from "../../shared/format";
import type { ListSource } from "./components/list-controller";
import { StatTile } from "./components/StatTile";
import { Timeline, type TimelineEntry } from "../../shared/Timeline";
import { incidentHref } from "./IncidentsScreen";
import { activityCrumb } from "./nav";
import { INCIDENT_STATUS_TONE, SEVERITY_TONE, SLA_TONE, toneOf } from "./tones";
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
  /** A name for a comment's `author_id`; the endpoint sends only the id. */
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

const TABS: { key: IncidentTab; label: string; path: string }[] = [
  { key: "timeline", label: "Timeline", path: "" },
  { key: "evidence", label: "Evidence", path: "/evidence" },
  { key: "comments", label: "Comments", path: "/comments" },
];

const ACTIVE = new Set(["open", "investigating", "mitigating"]);

/** The incident's moments and its comments, oldest first. */
export function incidentTimeline(
  incident: IncidentData,
  comments: readonly IncidentComment[],
  authorName: (id: string) => string,
): TimelineEntry[] {
  const moments: (TimelineEntry | null)[] = [
    incident.occurredAt
      ? {
          id: "occurred",
          at: incident.occurredAt,
          title: "Occurred",
          tone: toneOf(SEVERITY_TONE, incident.severity),
        }
      : null,
    incident.detectedAt
      ? {
          id: "detected",
          at: incident.detectedAt,
          title: "Detected",
          actor: incident.reportedByName ?? undefined,
          tone: "warn",
        }
      : null,
    incident.acknowledgedAt
      ? {
          id: "acknowledged",
          at: incident.acknowledgedAt,
          title: "Acknowledged",
          actor: incident.assignedToName ?? undefined,
          tone: "info",
        }
      : null,
    incident.resolvedAt
      ? {
          id: "resolved",
          at: incident.resolvedAt,
          title: "Resolved",
          body: incident.resolution ?? undefined,
          tone: "ok",
        }
      : null,
    incident.closedAt
      ? { id: "closed", at: incident.closedAt, title: "Closed", tone: "muted" }
      : null,
  ];
  const notes: TimelineEntry[] = comments
    .filter((c) => c.created_at)
    .map((c) => ({
      id: `comment-${c.id}`,
      at: c.created_at as string,
      title: "Comment",
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
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
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
            e instanceof Error ? e.message : "The comment was not saved.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <label htmlFor={id} className="text-sm">
        Add a comment
      </label>
      <textarea
        id={id}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Post comment"}
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
  if (comments.loading && comments.rows.length === 0)
    return <LoadingState label="Loading comments" rows={2} />;
  if (comments.error && comments.rows.length === 0)
    return (
      <ErrorState
        title="Could not load comments"
        error={comments.error}
        onRetry={comments.onRetry}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <Timeline
        label="Comments"
        emptyLabel="No comments yet."
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
  authorName = (id) => `User ${id}`,
  evidenceHref,
  canMutate,
  onAcknowledge,
  onResolve,
  onClose,
  onComment,
}: IncidentDetailScreenProps) {
  const [confirm, setConfirm] = React.useState<"resolve" | "close" | null>(
    null,
  );
  const crumbs = [
    activityCrumb("incidents"),
    { label: "Incidents", href: "/incidents" },
  ];

  if (!incident) {
    return (
      <PageFrame
        crumbs={crumbs}
        title={loading ? "Incident" : error ? "Incident" : "Incident not found"}
      >
        {loading ? (
          <LoadingState label="Loading the incident" variant="page" />
        ) : error ? (
          <ErrorState
            title="Could not load the incident"
            error={error}
            onRetry={onRetry}
          />
        ) : (
          <EmptyState
            title="This incident does not exist"
            description="It may belong to another organization, or the link is wrong."
            actionHref="/incidents"
            actionLabel="Back to Incidents"
          />
        )}
      </PageFrame>
    );
  }

  const base = incidentHref(incident);
  const tabs: TabNavItem[] = TABS.map((t) => ({
    key: t.key,
    label:
      t.key === "comments" && comments.rows.length
        ? `${t.label} (${comments.rows.length})`
        : t.label,
    href: `${base}${t.path}`,
    active: t.key === tab,
  }));
  const active = ACTIVE.has(incident.status);
  const primaryAction = !canMutate ? undefined : active &&
    !incident.acknowledgedAt ? (
    <Button size="sm" onClick={onAcknowledge}>
      Acknowledge
    </Button>
  ) : active ? (
    <Button size="sm" onClick={() => setConfirm("resolve")}>
      Resolve
    </Button>
  ) : incident.status === "resolved" ? (
    <Button size="sm" variant="outline" onClick={() => setConfirm("close")}>
      Close
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
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Incident actions"
            >
              <MoreHorizontalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={evidenceHref} download>
                <DownloadIcon aria-hidden />
                Download evidence
              </a>
            </DropdownMenuItem>
            {canMutate && active && incident.acknowledgedAt === null && (
              <DropdownMenuItem onSelect={() => setConfirm("resolve")}>
                Resolve without acknowledging
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
      tabs={tabs}
      tabsLabel="Incident"
    >
      <Section title="Summary" headingLevel="h2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Time to acknowledge"
            value={formatDuration(incident.timeToAcknowledgeSeconds)}
            hint={incident.acknowledgedAt ? undefined : "Not acknowledged"}
          />
          <StatTile
            label="Time to resolve"
            value={formatDuration(incident.timeToResolveSeconds)}
            hint={incident.resolvedAt ? undefined : "Still open"}
          />
          <StatTile
            label="SLA"
            value={humanize(incident.slaStatus)}
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
              term: "Type",
              value:
                incident.incidentTypeDisplay ?? humanize(incident.incidentType),
            },
            { term: "Agent", value: incident.endpointName },
            { term: "Triggering policy", value: incident.triggeringPolicyName },
            { term: "Related risk", value: incident.relatedRiskName },
            {
              term: "Assignee",
              value: incident.assignedToName ?? "Unassigned",
            },
            { term: "Reported by", value: incident.reportedByName },
            {
              term: "Affected",
              value:
                incident.affectedUser ??
                (incident.affectedUserCount !== null
                  ? `${incident.affectedUserCount.toLocaleString("en")} users`
                  : null),
            },
            {
              term: "Tags",
              value: incident.tags.length ? incident.tags.join(", ") : null,
            },
          ]}
        />
      </Section>
      {tab === "timeline" && (
        <Section title="Timeline">
          <Timeline
            label="Incident timeline"
            entries={incidentTimeline(incident, comments.rows, authorName)}
          />
        </Section>
      )}
      {tab === "evidence" && (
        <Section
          title="Evidence"
          description="A signed NDJSON bundle of the audit records tied to this incident and to the correlation chain of the event that raised it."
          action={
            <Button size="sm" variant="outline" asChild>
              <a href={evidenceHref} download>
                <DownloadIcon aria-hidden />
                Download bundle
              </a>
            </Button>
          }
        >
          <DefinitionList
            columns={1}
            items={[
              { term: "Root cause", value: incident.rootCause },
              { term: "Impact", value: incident.impactAssessment },
              { term: "Resolution", value: incident.resolution },
            ]}
          />
        </Section>
      )}
      {tab === "comments" && (
        <Section title="Comments">
          <Comments
            comments={comments}
            authorName={authorName}
            canMutate={canMutate}
            onComment={onComment}
          />
        </Section>
      )}
      <ConfirmDialog
        open={confirm === "resolve"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Resolve this incident?"
        description="The resolution goes on the incident and into the audit log."
        confirmLabel="Resolve"
        reason={{ label: "Resolution", placeholder: "What fixed it" }}
        onConfirm={(resolution) => onResolve?.(resolution)}
      />
      <ConfirmDialog
        open={confirm === "close"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Close this incident?"
        description="A closed incident leaves the open queue. Its timeline and evidence stay."
        confirmLabel="Close incident"
        onConfirm={() => onClose?.()}
      />
    </PageFrame>
  );
}

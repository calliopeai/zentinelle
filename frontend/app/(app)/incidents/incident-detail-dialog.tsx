"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2Icon, MessageSquareIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import type { IncidentData } from "@/graphql/risks/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";

/* ── Comment types ──────────────────────────────────────────────── */

type CommentSeverity = "info" | "low" | "medium" | "high" | "critical";

interface IncidentComment {
  id: number;
  author_id: string | null;
  body: string;
  created_at: string | null;
}

interface CommentsResponse {
  count: number;
  results: IncidentComment[];
}

const SEVERITY_PREFIX_RE = /^\[severity:(info|low|medium|high|critical)\]\s*/i;

function parseSeverity(body: string): {
  severity: CommentSeverity | null;
  text: string;
} {
  const m = body.match(SEVERITY_PREFIX_RE);
  if (!m) return { severity: null, text: body };
  return {
    severity: m[1].toLowerCase() as CommentSeverity,
    text: body.slice(m[0].length),
  };
}

function severityBadge(severity: CommentSeverity) {
  switch (severity) {
    case "critical":
    case "high":
      return {
        variant: "destructive" as const,
        className: "",
      };
    case "medium":
      return {
        variant: "secondary" as const,
        className:
          "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20",
      };
    case "low":
      return {
        variant: "outline" as const,
        className:
          "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
      };
    case "info":
    default:
      return {
        variant: "outline" as const,
        className: "",
      };
  }
}

function severityHighlight(severity: CommentSeverity) {
  switch (severity) {
    case "critical":
    case "high":
      return "border-l-red-500 bg-red-500/5";
    case "medium":
      return "border-l-amber-500 bg-amber-500/5";
    case "low":
      return "border-l-blue-500 bg-blue-500/5";
    default:
      return "border-l-border";
  }
}

/* ── Existing helpers ───────────────────────────────────────────── */

function severityVariant(severity: string) {
  switch (severity) {
    case "critical":
    case "high":
      return "destructive" as const;
    case "medium":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "open":
      return "destructive" as const;
    case "acknowledged":
    case "investigating":
      return "secondary" as const;
    case "resolved":
      return "default" as const;
    default:
      return "outline" as const;
  }
}

function slaVariant(sla: string | null) {
  switch (sla) {
    case "met":
      return "default" as const;
    case "at_risk":
      return "secondary" as const;
    case "breached":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function formatTimestamp(ts: string | null | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString();
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "--";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/* ── Comments thread component ──────────────────────────────────── */

function CommentsThread({ incidentId }: { incidentId: string }) {
  const [comments, setComments] = useState<IncidentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [severity, setSeverity] = useState<CommentSeverity>("info");
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/incidents/${incidentId}/comments/`,
        {
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      if (!res.ok) {
        throw new Error(`Failed to load comments (${res.status})`);
      }
      const data: CommentsResponse = await res.json();
      // Backend returns ordered by created_at ascending, but enforce here
      // for the chronological-display contract.
      const sorted = [...(data.results ?? [])].sort((a, b) => {
        const aT = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bT = b.created_at ? new Date(b.created_at).getTime() : 0;
        return aT - bT;
      });
      setComments(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comments");
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadComments();
  }, [loadComments]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = content.trim();
      if (!trimmed) return;

      setSubmitting(true);
      try {
        const body =
          severity === "info"
            ? trimmed
            : `[severity:${severity}] ${trimmed}`;

        const res = await fetch(
          `${API_URL}/incidents/${incidentId}/comments/`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ content: body, body }),
          },
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `Failed to post comment (${res.status})${text ? `: ${text}` : ""}`,
          );
        }

        const created: IncidentComment = await res.json();
        setComments((prev) => [...prev, created]);
        setContent("");
        setSeverity("info");
        toast.success("Comment posted");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to post comment",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [content, severity, incidentId],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquareIcon className="text-muted-foreground h-4 w-4" />
        <h3 className="text-sm font-medium">
          Comments
          {comments.length > 0 && (
            <span className="text-muted-foreground ml-1.5 font-normal">
              ({comments.length})
            </span>
          )}
        </h3>
      </div>

      {/* Existing comments */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      ) : comments.length === 0 ? (
        <div className="bg-muted/40 flex items-center justify-center rounded-md border border-dashed py-6">
          <p className="text-muted-foreground text-sm">No comments yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => {
            const { severity: sev, text } = parseSeverity(c.body);
            return (
              <li
                key={c.id}
                className={cn(
                  "rounded-md border border-l-4 px-3 py-2",
                  sev ? severityHighlight(sev) : "border-l-border bg-muted/30",
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {c.author_id || "system"}
                  </span>
                  {sev && (() => {
                    const cfg = severityBadge(sev);
                    return (
                      <Badge
                        variant={cfg.variant}
                        className={cn("text-[10px] uppercase", cfg.className)}
                      >
                        {sev}
                      </Badge>
                    );
                  })()}
                  <span className="text-muted-foreground ml-auto text-xs">
                    {formatTimestamp(c.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {text}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/* New-comment form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a comment... (Cmd/Ctrl+Enter to post)"
          rows={3}
          className="resize-none"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          disabled={submitting}
        />
        <div className="flex items-center justify-between gap-2">
          <Select
            value={severity}
            onValueChange={(v) => setSeverity(v as CommentSeverity)}
            disabled={submitting}
          >
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="submit"
            size="sm"
            disabled={submitting || content.trim().length === 0}
          >
            {submitting ? (
              <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <SendIcon className="mr-1.5 h-3.5 w-3.5" />
            )}
            Post
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ── Main dialog ────────────────────────────────────────────────── */

type IncidentDetailDialogProps = {
  incident: IncidentData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function IncidentDetailDialog({
  incident,
  open,
  onOpenChange,
}: IncidentDetailDialogProps) {
  if (!incident) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <DialogTitle className="text-base">{incident.title}</DialogTitle>
              <DialogDescription>
                Reported {formatTimestamp(incident.createdAt)}
                {incident.reportedByName && (
                  <span> by {incident.reportedByName}</span>
                )}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              <Badge variant={severityVariant(incident.severity)}>
                {incident.severityDisplay ?? incident.severity}
              </Badge>
              <Badge variant={statusVariant(incident.status)}>
                {incident.statusDisplay ?? incident.status}
              </Badge>
              {incident.slaStatus && (
                <Badge variant={slaVariant(incident.slaStatus)}>
                  SLA: {incident.slaStatus}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          <Field label="Description">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {incident.description || "--"}
            </p>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Badge variant="outline">
                {incident.incidentTypeDisplay ?? incident.incidentType}
              </Badge>
            </Field>
            <Field label="Assigned To">
              <span className="text-muted-foreground">
                {incident.assignedToName ?? "Unassigned"}
              </span>
            </Field>
            <Field label="Affected User">
              <span className="text-muted-foreground">
                {incident.affectedUser ?? "--"}
              </span>
            </Field>
            <Field label="Affected User Count">
              <span className="text-muted-foreground">
                {incident.affectedUserCount ?? "--"}
              </span>
            </Field>
            <Field label="Endpoint">
              <span className="text-muted-foreground">
                {incident.endpointName ?? "--"}
              </span>
            </Field>
            <Field label="Triggering Policy">
              <span className="text-muted-foreground">
                {incident.triggeringPolicyName ?? "--"}
              </span>
            </Field>
            <Field label="Related Risk">
              <span className="text-muted-foreground">
                {incident.relatedRiskName ?? "--"}
              </span>
            </Field>
          </div>

          <Separator />

          <Field label="Timeline">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Occurred:</span>{" "}
                {formatTimestamp(incident.occurredAt)}
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Detected:</span>{" "}
                {formatTimestamp(incident.detectedAt)}
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Acknowledged:</span>{" "}
                {formatTimestamp(incident.acknowledgedAt)}
                {incident.timeToAcknowledgeSeconds != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({formatDuration(incident.timeToAcknowledgeSeconds)})
                  </span>
                )}
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Resolved:</span>{" "}
                {formatTimestamp(incident.resolvedAt)}
                {incident.timeToResolveSeconds != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({formatDuration(incident.timeToResolveSeconds)})
                  </span>
                )}
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Closed:</span>{" "}
                {formatTimestamp(incident.closedAt)}
              </div>
            </div>
          </Field>

          {(incident.rootCause ||
            incident.impactAssessment ||
            incident.resolution) && (
            <>
              <Separator />
              <div className="space-y-4">
                {incident.rootCause && (
                  <Field label="Root Cause">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {incident.rootCause}
                    </p>
                  </Field>
                )}
                {incident.impactAssessment && (
                  <Field label="Impact Assessment">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {incident.impactAssessment}
                    </p>
                  </Field>
                )}
                {incident.resolution && (
                  <Field label="Resolution">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {incident.resolution}
                    </p>
                  </Field>
                )}
              </div>
            </>
          )}

          {incident.tags && incident.tags.length > 0 && (
            <>
              <Separator />
              <Field label="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {incident.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Field>
            </>
          )}

          <Separator />

          <CommentsThread incidentId={incident.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

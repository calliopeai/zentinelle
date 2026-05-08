"use client";

import { MessageSquareIcon } from "lucide-react";
import type { IncidentData } from "@/graphql/risks/types";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

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

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquareIcon className="text-muted-foreground h-4 w-4" />
              <h3 className="text-sm font-medium">Comments</h3>
            </div>
            <div className="bg-muted/40 flex items-center justify-center rounded-md border border-dashed py-8">
              <p className="text-muted-foreground text-sm">
                Comments thread coming soon
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

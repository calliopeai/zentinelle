"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@apollo/client/react";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleSlashIcon,
  PencilIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";

import { useRisk } from "@/graphql/risks/hooks";
import {
  DELETE_RISK,
  REVIEW_RISK,
  UPDATE_RISK,
} from "@/graphql/risks/mutations";
import type { UpdateRiskPayload } from "@/graphql/risks/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/hooks/use-confirm";
import { EditRiskDialog } from "../edit-risk-dialog";

interface DeleteRiskPayload {
  success: boolean | null;
  errors: string[];
}

interface ReviewRiskPayload {
  success: boolean | null;
  errors: string[];
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "open":
    case "identified":
      return "destructive";
    case "mitigating":
    case "assessed":
      return "secondary";
    case "accepted":
    case "transferred":
      return "outline";
    case "closed":
      return "default";
    default:
      return "outline";
  }
}

function riskLevelVariant(level: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (level?.toLowerCase()) {
    case "critical":
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
    default:
      return "outline";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function rpn(severity: number, likelihood: number, impact: number): number {
  return severity * likelihood * impact;
}

// Severity is derived from impact on a Fibonacci scale (1, 2, 3, 5, 8) so the
// RPN amplifies high-impact risks more aggressively than a flat 1-5 scale.
const FIBONACCI_SEVERITY = [1, 2, 3, 5, 8];

function severityFromImpact(impact: number): number {
  const idx = Math.max(0, Math.min(FIBONACCI_SEVERITY.length - 1, impact - 1));
  return FIBONACCI_SEVERITY[idx];
}

export default function RiskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const { risk, loading, error, refetch } = useRisk(id);

  const [editOpen, setEditOpen] = useState(false);
  const confirm = useConfirm();

  const [deleteRisk, { loading: deleting }] =
    useMutation<{ deleteRisk: DeleteRiskPayload }>(DELETE_RISK);
  const [reviewRisk, { loading: reviewing }] =
    useMutation<{ reviewRisk: ReviewRiskPayload }>(REVIEW_RISK);
  const [updateRisk, { loading: updating }] =
    useMutation<{ updateRisk: UpdateRiskPayload }>(UPDATE_RISK);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive/40">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">
              Failed to load risk: {error.message}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/risks">
                <ArrowLeftIcon className="mr-1.5 size-4" />
                Back to risks
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!risk) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">Risk not found.</p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/risks">
                <ArrowLeftIcon className="mr-1.5 size-4" />
                Back to risks
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleReview = async () => {
    try {
      const { data } = await reviewRisk({ variables: { id: risk.id } });
      if (data?.reviewRisk?.success) {
        toast.success("Risk marked as reviewed");
        refetch();
      } else {
        toast.error(data?.reviewRisk?.errors?.[0] ?? "Failed to mark as reviewed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark as reviewed");
    }
  };

  const updateStatus = async (status: "mitigating" | "closed", successMessage: string) => {
    try {
      const { data } = await updateRisk({
        variables: {
          id: risk.id,
          input: { status },
        },
      });
      if (data?.updateRisk?.success) {
        toast.success(successMessage);
        refetch();
      } else {
        toast.error(data?.updateRisk?.errors?.[0] ?? "Failed to update risk");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update risk");
    }
  };

  const handleMitigate = () => updateStatus("mitigating", "Risk moved to mitigating");
  const handleClose = () => updateStatus("closed", "Risk closed");

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete risk "${risk.name}"?`,
      description:
        "Permanently removes this risk from the register. This cannot be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const { data } = await deleteRisk({ variables: { id: risk.id } });
      if (data?.deleteRisk?.success === false) {
        toast.error(data.deleteRisk.errors?.[0] ?? "Failed to delete risk");
        return;
      }
      toast.success("Risk deleted");
      router.push("/risks");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete risk");
    }
  };

  const severity = severityFromImpact(risk.impact);
  const inherentRpn = rpn(severity, risk.likelihood, risk.impact);

  const hasResidual =
    risk.residualLikelihood !== null && risk.residualImpact !== null;
  const residualSeverity = hasResidual
    ? severityFromImpact(risk.residualImpact as number)
    : null;
  const residualRpn = hasResidual
    ? rpn(residualSeverity as number, risk.residualLikelihood as number, risk.residualImpact as number)
    : null;

  const isClosed = risk.status === "closed";
  const isMitigating = risk.status === "mitigating";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2">
            <Link href="/risks">
              <ArrowLeftIcon className="mr-1.5 size-4" />
              All risks
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{risk.name}</h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant={statusVariant(risk.status)}>
              {risk.statusDisplay ?? risk.status}
            </Badge>
            {risk.riskLevel && (
              <Badge variant={riskLevelVariant(risk.riskLevel)}>
                {risk.riskLevel}
              </Badge>
            )}
            <Badge variant="outline">
              {risk.categoryDisplay ?? risk.category}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <PencilIcon className="mr-1.5 size-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReview}
            disabled={reviewing || isClosed}
          >
            <CheckCircle2Icon className="mr-1.5 size-4" />
            Mark Reviewed
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMitigate}
            disabled={updating || isClosed || isMitigating}
          >
            <ShieldCheckIcon className="mr-1.5 size-4" />
            Mitigate
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={updating || isClosed}
          >
            <CircleSlashIcon className="mr-1.5 size-4" />
            Close
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Category">
            <Badge variant="outline">
              {risk.categoryDisplay ?? risk.category}
            </Badge>
          </Field>
          <Field label="Severity">
            <span className="font-mono text-sm font-medium">{severity}</span>
            <span className="text-muted-foreground ml-1 text-xs">(Fibonacci)</span>
          </Field>
          <Field label="Likelihood">
            <span className="text-sm">
              {risk.likelihoodDisplay ?? risk.likelihood}
            </span>
          </Field>
          <Field label="Impact">
            <span className="text-sm">
              {risk.impactDisplay ?? risk.impact}
            </span>
          </Field>
          <Field label="RPN">
            <span className="font-mono text-sm font-medium">{inherentRpn}</span>
            <span className="text-muted-foreground ml-1 text-[11px]">
              ({severity} x {risk.likelihood} x {risk.impact})
            </span>
          </Field>
          <Field label="Status">
            <Badge variant={statusVariant(risk.status)}>
              {risk.statusDisplay ?? risk.status}
            </Badge>
          </Field>
          <Field label="Owner">
            <span className="text-sm">{risk.ownerName ?? "--"}</span>
          </Field>
          <Field label="Incidents">
            <span className="text-sm">{risk.incidentCount ?? 0}</span>
          </Field>
          <Field label="Identified">
            <span className="text-muted-foreground text-xs">
              {formatDate(risk.identifiedAt)}
            </span>
          </Field>
          <Field label="Last reviewed">
            <span className="text-muted-foreground text-xs">
              {formatDate(risk.lastReviewedAt)}
              {risk.lastReviewedByName && ` by ${risk.lastReviewedByName}`}
            </span>
          </Field>
          <Field label="Created">
            <span className="text-muted-foreground text-xs">
              {formatDate(risk.createdAt)}
            </span>
          </Field>
          <Field label="Last updated">
            <span className="text-muted-foreground text-xs">
              {formatDate(risk.updatedAt)}
            </span>
          </Field>
          <Field label="Next review">
            <span className="text-muted-foreground text-xs">
              {formatDate(risk.nextReviewDate)}
            </span>
          </Field>
          <Field label="ID">
            <code className="text-muted-foreground text-[11px] break-all">
              {risk.id}
            </code>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          {risk.description ? (
            <p className="text-sm whitespace-pre-wrap">{risk.description}</p>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              No description provided.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mitigation Plan</CardTitle>
          {risk.mitigationStatus && (
            <CardDescription>
              Status: {risk.mitigationStatus}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {risk.mitigationPlan ? (
            <p className="text-sm whitespace-pre-wrap">{risk.mitigationPlan}</p>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              No mitigation plan documented.
            </p>
          )}
        </CardContent>
      </Card>

      {hasResidual && residualRpn !== null && residualSeverity !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Residual Risk</CardTitle>
            <CardDescription>
              Risk remaining after mitigation controls are applied.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Residual Severity">
              <span className="font-mono text-sm font-medium">{residualSeverity}</span>
            </Field>
            <Field label="Residual Likelihood">
              <span className="text-sm">{risk.residualLikelihood}</span>
            </Field>
            <Field label="Residual Impact">
              <span className="text-sm">{risk.residualImpact}</span>
            </Field>
            <Field label="Residual RPN">
              <span className="font-mono text-sm font-medium">{residualRpn}</span>
              <span className="text-muted-foreground ml-1 text-[11px]">
                ({residualSeverity} x {risk.residualLikelihood} x {risk.residualImpact})
              </span>
            </Field>
          </CardContent>
        </Card>
      )}

      {risk.tags && risk.tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {risk.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive text-base">Danger zone</CardTitle>
          <CardDescription>
            Permanently delete this risk. Cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2Icon className="mr-1.5 size-4" />
            Delete risk
          </Button>
        </CardContent>
      </Card>

      <EditRiskDialog
        risk={risk}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => {
          setEditOpen(false);
          refetch();
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

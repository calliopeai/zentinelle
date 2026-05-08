"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ShieldAlertIcon,
  AlertTriangleIcon,
  PlusIcon,
  MoreHorizontalIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/hooks/use-confirm";
import {
  RetentionPolicyDialog,
  type RetentionPolicyEditData,
} from "./retention-policy-dialog";
import {
  DELETE_RETENTION_POLICY,
} from "@/graphql/retention/mutations";

interface RetentionPolicyData {
  id: string;
  name: string;
  description: string | null;
  entityType: string;
  retentionDays: number;
  minimumRetentionDays: number | null;
  expirationAction: string;
  expirationActionDisplay: string | null;
  entityTypeDisplay: string | null;
  complianceRequirement: string | null;
  complianceRequirementDisplay: string | null;
  enabled: boolean;
  priority: number;
}

interface LegalHoldData {
  id: string;
  name: string;
  status: string;
  holdType: string;
  holdTypeDisplay: string | null;
  statusDisplay: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  isActive: boolean | null;
}

interface RetentionQueryData {
  retentionPolicies: RetentionPolicyData[];
  legalHolds: LegalHoldData[];
}

interface ToggleRetentionResult {
  toggleRetentionPolicyEnabled: {
    success: boolean | null;
    policyId: string | null;
  };
}

interface DeleteRetentionResult {
  deleteRetentionPolicy: {
    success: boolean | null;
    errors: string[];
  };
}

const GET_RETENTION_DATA = gql`
  query RetentionData {
    retentionPolicies {
      id
      name
      description
      entityType
      retentionDays
      minimumRetentionDays
      expirationAction
      expirationActionDisplay
      entityTypeDisplay
      complianceRequirement
      complianceRequirementDisplay
      enabled
      priority
    }
    legalHolds {
      id
      name
      status
      holdType
      holdTypeDisplay
      statusDisplay
      effectiveDate
      expirationDate
      isActive
    }
  }
`;

const TOGGLE_RETENTION_POLICY_ENABLED = gql`
  mutation ToggleRetentionPolicyEnabled($id: ID!) {
    toggleRetentionPolicyEnabled(id: $id) {
      success
      policyId
    }
  }
`;

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function holdStatusVariant(
  status: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "pending":
      return "secondary";
    case "released":
    case "expired":
      return "outline";
    default:
      return "outline";
  }
}

function toEditData(p: RetentionPolicyData): RetentionPolicyEditData {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    entityType: p.entityType,
    retentionDays: p.retentionDays,
    minimumRetentionDays: p.minimumRetentionDays,
    expirationAction: p.expirationAction,
    complianceRequirement: p.complianceRequirement,
    enabled: p.enabled,
    priority: p.priority,
  };
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-1 h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6 text-center">
              <Skeleton className="mx-auto h-8 w-8" />
              <Skeleton className="mx-auto mt-2 h-7 w-16" />
              <Skeleton className="mx-auto mt-1 h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function RetentionPage() {
  const { data, loading, error, refetch } =
    useQuery<RetentionQueryData>(GET_RETENTION_DATA);
  const [toggleEnabled] = useMutation<ToggleRetentionResult>(
    TOGGLE_RETENTION_POLICY_ENABLED,
  );
  const [deletePolicy] = useMutation<DeleteRetentionResult>(
    DELETE_RETENTION_POLICY,
  );
  const confirm = useConfirm();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPolicy, setEditPolicy] =
    useState<RetentionPolicyEditData | null>(null);

  const retentionPolicies = data?.retentionPolicies ?? [];
  const legalHolds = data?.legalHolds ?? [];
  const activeLegalHolds = legalHolds.filter((h) => h.isActive === true);

  // Derive summary stats from real data
  const eventRetention = retentionPolicies.find(
    (p) => p.entityType === "event" || p.entityType === "events",
  );
  const auditRetention = retentionPolicies.find(
    (p) =>
      p.entityType === "audit_log" ||
      p.entityType === "audit_logs" ||
      p.entityType === "interaction_log" ||
      p.entityType === "interactions",
  );

  const handleToggle = async (policyId: string) => {
    try {
      const { data: result } = await toggleEnabled({
        variables: { id: policyId },
      });
      if (result?.toggleRetentionPolicyEnabled?.success) {
        toast.success("Retention policy updated");
        refetch();
      } else {
        toast.error("Failed to update policy");
      }
    } catch {
      toast.error("Failed to update policy", {
        description: "An unexpected error occurred.",
      });
    }
  };

  const handleCreate = () => {
    setEditPolicy(null);
    setDialogOpen(true);
  };

  const handleEdit = (policy: RetentionPolicyData) => {
    setEditPolicy(toEditData(policy));
    setDialogOpen(true);
  };

  const handleDelete = async (policy: RetentionPolicyData) => {
    const ok = await confirm({
      title: "Delete Retention Policy",
      description: `Permanently delete "${policy.name}"? Data subject to this policy will fall back to other policies or default retention. This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const { data: result } = await deletePolicy({
        variables: { id: policy.id },
      });
      if (result?.deleteRetentionPolicy?.success) {
        toast.success(`Policy "${policy.name}" deleted`);
        refetch();
      } else {
        toast.error(
          result?.deleteRetentionPolicy?.errors?.[0] ?? "Failed to delete policy",
        );
      }
    } catch {
      toast.error("Failed to delete policy");
    }
  };

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Data Retention</h1>
          <p className="text-muted-foreground">
            Manage data lifecycle policies and legal holds
          </p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          Failed to load retention data. Please try again later.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Data Retention</h1>
          <p className="text-muted-foreground">
            Manage data lifecycle policies and legal holds
          </p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <PlusIcon className="mr-1.5 h-4 w-4" />
          Create Policy
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <ArchiveIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-2 text-2xl font-bold">
              {eventRetention ? `${eventRetention.retentionDays} days` : "--"}
            </div>
            <div className="text-muted-foreground text-sm">Event retention</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <ArchiveIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-2 text-2xl font-bold">
              {auditRetention ? `${auditRetention.retentionDays} days` : "--"}
            </div>
            <div className="text-muted-foreground text-sm">
              Audit log retention
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <ShieldAlertIcon
              className={`mx-auto h-8 w-8 ${
                activeLegalHolds.length > 0
                  ? "text-yellow-500"
                  : "text-muted-foreground"
              }`}
            />
            <div className="mt-2 text-2xl font-bold">
              {activeLegalHolds.length}
            </div>
            <div className="text-muted-foreground text-sm">
              Active legal holds
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retention policies table */}
      <Card>
        <CardHeader>
          <CardTitle>Retention Policies</CardTitle>
          <CardDescription>
            Configure how long different data types are retained
          </CardDescription>
        </CardHeader>
        <CardContent>
          {retentionPolicies.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-muted-foreground text-sm">
                No retention policies configured. Create policies to manage
                data lifecycle.
              </p>
              <Button size="sm" onClick={handleCreate}>
                <PlusIcon className="mr-1.5 h-4 w-4" />
                Create Policy
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>Retention</TableHead>
                  <TableHead>Expiration Action</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retentionPolicies.map((p) => (
                  <TableRow
                    key={p.id}
                    className="hover:bg-muted/40 cursor-pointer"
                    onClick={() => handleEdit(p)}
                  >
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {p.entityTypeDisplay || p.entityType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {p.retentionDays} days
                      </span>
                      {p.minimumRetentionDays && p.minimumRetentionDays > 0 && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          (min: {p.minimumRetentionDays})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.expirationActionDisplay || p.expirationAction}
                    </TableCell>
                    <TableCell>
                      {p.complianceRequirementDisplay ||
                      (p.complianceRequirement &&
                        p.complianceRequirement !== "none") ? (
                        <Badge variant="secondary" className="text-xs">
                          {p.complianceRequirementDisplay ||
                            p.complianceRequirement}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">--</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={p.enabled}
                        onCheckedChange={() => handleToggle(p.id)}
                        aria-label={`Toggle ${p.name}`}
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Open actions for ${p.name}`}
                          >
                            <MoreHorizontalIcon className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(p)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggle(p.id)}
                          >
                            {p.enabled ? "Disable" : "Enable"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(p)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Legal holds */}
      {legalHolds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="h-4 w-4 text-yellow-500" />
              Legal Holds
            </CardTitle>
            <CardDescription>
              Data preservation orders that override retention policies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Expiration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legalHolds.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell>{h.holdTypeDisplay || h.holdType}</TableCell>
                    <TableCell>
                      <Badge variant={holdStatusVariant(h.status)}>
                        {h.statusDisplay || h.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(h.effectiveDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(h.expirationDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <RetentionPolicyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => refetch()}
        editPolicy={editPolicy}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ShieldAlertIcon,
  PlusIcon,
  MoreHorizontalIcon,
  LockOpenIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  useLegalHolds,
  useReleaseLegalHold,
  useDeleteLegalHold,
} from "@/graphql/legal-holds/hooks";
import type { LegalHoldData } from "@/graphql/legal-holds/types";
import {
  LegalHoldDialog,
  type LegalHoldEditData,
} from "./legal-hold-dialog";

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusVariant(
  status: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "released":
      return "outline";
    case "expired":
      return "secondary";
    default:
      return "outline";
  }
}

function describeScope(hold: LegalHoldData): string {
  if (hold.appliesToAll) return "All data";
  const parts: string[] = [];
  if (hold.entityTypes.length > 0) {
    parts.push(
      `${hold.entityTypes.length} entity type${hold.entityTypes.length === 1 ? "" : "s"}`,
    );
  }
  if (hold.userIdentifiers.length > 0) {
    parts.push(
      `${hold.userIdentifiers.length} user${hold.userIdentifiers.length === 1 ? "" : "s"}`,
    );
  }
  return parts.length > 0 ? parts.join(", ") : "No scope set";
}

function toEditData(h: LegalHoldData): LegalHoldEditData {
  return {
    id: h.id,
    name: h.name,
    description: h.description,
    referenceNumber: h.referenceNumber,
    holdType: h.holdType,
    appliesToAll: h.appliesToAll,
    entityTypes: h.entityTypes ?? [],
    userIdentifiers: h.userIdentifiers ?? [],
    dataFrom: h.dataFrom,
    dataTo: h.dataTo,
    effectiveDate: h.effectiveDate,
    expirationDate: h.expirationDate,
    custodianEmail: h.custodianEmail,
    notifyOnAccess: h.notifyOnAccess,
    notificationEmails: h.notificationEmails ?? [],
  };
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-1 h-4 w-80" />
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

export default function LegalHoldsPage() {
  const { holds, loading, error, refetch } = useLegalHolds();
  const [releaseHold] = useReleaseLegalHold();
  const [deleteHold] = useDeleteLegalHold();
  const confirm = useConfirm();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editHold, setEditHold] = useState<LegalHoldEditData | null>(null);

  const activeHolds = holds.filter((h) => h.isActive === true);
  const releasedHolds = holds.filter(
    (h) => h.status === "released" || h.status === "expired",
  );

  const handleCreate = () => {
    setEditHold(null);
    setDialogOpen(true);
  };

  const handleEdit = (hold: LegalHoldData) => {
    setEditHold(toEditData(hold));
    setDialogOpen(true);
  };

  const handleRelease = async (hold: LegalHoldData) => {
    const ok = await confirm({
      title: "Release Legal Hold",
      description:
        `Release "${hold.name}"? Data covered by this hold will become subject to normal retention policies again. ` +
        `The hold record itself will be preserved with a release timestamp for audit.`,
      confirmLabel: "Release Hold",
    });
    if (!ok) return;
    try {
      const { data } = await releaseHold({ variables: { id: hold.id } });
      if (data?.releaseLegalHold?.success) {
        toast.success(`Legal hold "${hold.name}" released`);
        refetch();
      } else {
        toast.error("Failed to release legal hold");
      }
    } catch {
      toast.error("Failed to release legal hold");
    }
  };

  const handleDelete = async (hold: LegalHoldData) => {
    const ok = await confirm({
      title: "Delete Legal Hold",
      description:
        `Permanently delete the record of "${hold.name}"? ` +
        `This is unusual — most workflows release a hold rather than delete it, since the record is part of the audit trail. ` +
        `Active holds cannot be deleted; release the hold first.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const { data } = await deleteHold({ variables: { id: hold.id } });
      if (data?.deleteLegalHold?.success) {
        toast.success(`Legal hold "${hold.name}" deleted`);
        refetch();
      } else {
        toast.error(
          data?.deleteLegalHold?.errors?.[0] ?? "Failed to delete legal hold",
        );
      }
    } catch {
      toast.error("Failed to delete legal hold");
    }
  };

  if (loading && holds.length === 0) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Legal Holds</h1>
          <p className="text-muted-foreground">
            Preserve data from retention deletion for litigation, audit, or
            investigation.
          </p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          Failed to load legal holds. Please try again later.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Legal Holds</h1>
          <p className="text-muted-foreground">
            Freeze data from retention deletion for litigation, audit, or
            regulatory investigation.
          </p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <PlusIcon className="mr-1.5 h-4 w-4" />
          Create Hold
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6 text-center">
            <ShieldAlertIcon
              className={`mx-auto h-8 w-8 ${
                activeHolds.length > 0
                  ? "text-yellow-500"
                  : "text-muted-foreground"
              }`}
            />
            <div className="mt-2 text-2xl font-bold">{activeHolds.length}</div>
            <div className="text-muted-foreground text-sm">Active holds</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <LockOpenIcon className="text-muted-foreground mx-auto h-8 w-8" />
            <div className="mt-2 text-2xl font-bold">
              {releasedHolds.length}
            </div>
            <div className="text-muted-foreground text-sm">
              Released / expired
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <ShieldAlertIcon className="text-muted-foreground mx-auto h-8 w-8" />
            <div className="mt-2 text-2xl font-bold">{holds.length}</div>
            <div className="text-muted-foreground text-sm">Total holds</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Holds</CardTitle>
          <CardDescription>
            Active holds override retention policies. Released holds preserve
            the audit record but no longer block deletion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {holds.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-muted-foreground text-sm">
                No legal holds configured. Create a hold to preserve data
                regardless of retention policies.
              </p>
              <Button size="sm" onClick={handleCreate}>
                <PlusIcon className="mr-1.5 h-4 w-4" />
                Create Hold
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Released</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holds.map((h) => {
                  const isReleased =
                    h.status === "released" || h.status === "expired";
                  return (
                    <TableRow
                      key={h.id}
                      className={`hover:bg-muted/40 cursor-pointer ${
                        isReleased ? "text-muted-foreground" : ""
                      }`}
                      onClick={() => handleEdit(h)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{h.name}</span>
                          {h.referenceNumber && (
                            <span className="text-muted-foreground text-xs">
                              Ref: {h.referenceNumber}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {h.holdTypeDisplay || h.holdType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {describeScope(h)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(h.status)}>
                          {h.statusDisplay || h.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(h.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(h.releasedAt)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Open actions for ${h.name}`}
                            >
                              <MoreHorizontalIcon className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(h)}>
                              Edit
                            </DropdownMenuItem>
                            {!isReleased && (
                              <DropdownMenuItem
                                onClick={() => handleRelease(h)}
                              >
                                <LockOpenIcon className="mr-2 h-4 w-4" />
                                Release
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(h)}
                              disabled={!isReleased}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <LegalHoldDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => refetch()}
        editHold={editHold}
      />
    </div>
  );
}

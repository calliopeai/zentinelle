"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@apollo/client/react";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CopyIcon,
  HistoryIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

import { usePolicy } from "@/graphql/policies/hooks";
import {
  TOGGLE_POLICY_ENABLED,
  DELETE_POLICY,
  DUPLICATE_POLICY,
} from "@/graphql/policies/mutations";
import type {
  TogglePolicyEnabledPayload,
  DeletePolicyPayload,
} from "@/graphql/policies/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/hooks/use-confirm";
import { EditPolicyDialog } from "../edit-policy-dialog";
import { PolicyHistoryDialog } from "../history-dialog";

function enforcementVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  switch (level) {
    case "enforce":
      return "default";
    case "audit":
      return "secondary";
    case "disabled":
      return "outline";
    default:
      return "outline";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function PolicyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const { policy, loading, error, refetch } = usePolicy(id);

  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const confirm = useConfirm();

  const [toggleEnabled, { loading: toggling }] =
    useMutation<TogglePolicyEnabledPayload>(TOGGLE_POLICY_ENABLED);
  const [deletePolicy, { loading: deleting }] =
    useMutation<DeletePolicyPayload>(DELETE_POLICY);
  const [duplicatePolicy, { loading: duplicating }] = useMutation(DUPLICATE_POLICY);

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
            <p className="text-sm text-destructive">
              Failed to load policy: {error.message}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/policies">
                <ArrowLeftIcon className="size-4 mr-1.5" />
                Back to policies
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Policy not found.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/policies">
                <ArrowLeftIcon className="size-4 mr-1.5" />
                Back to policies
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleToggle = async () => {
    try {
      await toggleEnabled({ variables: { id: policy.id } });
      toast.success(`Policy ${policy.enabled ? "disabled" : "enabled"}`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to toggle policy");
    }
  };

  const handleDuplicate = async () => {
    try {
      await duplicatePolicy({ variables: { id: policy.id } });
      toast.success("Policy duplicated");
      router.push("/policies");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate policy");
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete policy "${policy.name}"?`,
      description: "This cannot be undone. Any agents bound by this policy will lose its enforcement.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await deletePolicy({ variables: { id: policy.id } });
      toast.success("Policy deleted");
      router.push("/policies");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete policy");
    }
  };

  const configEntries = Object.entries(policy.config ?? {});

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <Link href="/policies">
              <ArrowLeftIcon className="size-4 mr-1.5" />
              All policies
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{policy.name}</h1>
          {policy.description && (
            <p className="text-sm text-muted-foreground max-w-2xl">{policy.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <HistoryIcon className="size-4 mr-1.5" />
            History
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={duplicating}
          >
            <CopyIcon className="size-4 mr-1.5" />
            Duplicate
          </Button>
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <PencilIcon className="size-4 mr-1.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Type">
            <Badge variant="outline">{policy.policyType}</Badge>
          </Field>
          <Field label="Scope">
            <span className="text-sm">
              {policy.scopeName ?? policy.scopeType}
            </span>
          </Field>
          <Field label="Enforcement">
            <Badge variant={enforcementVariant(policy.enforcement)}>
              {policy.enforcement}
            </Badge>
          </Field>
          <Field label="Priority">
            <span className="text-sm">{policy.priority}</span>
          </Field>
          <Field label="Enabled">
            <div className="flex items-center gap-2">
              <Switch
                checked={policy.enabled}
                onCheckedChange={handleToggle}
                disabled={toggling}
                id="enabled-toggle"
              />
              <Label htmlFor="enabled-toggle" className="text-sm font-normal">
                {policy.enabled ? "Yes" : "No"}
              </Label>
            </div>
          </Field>
          <Field label="Created">
            <span className="text-xs text-muted-foreground">
              {formatDate(policy.createdAt)}
              {policy.createdByUsername && ` by ${policy.createdByUsername}`}
            </span>
          </Field>
          <Field label="Last updated">
            <span className="text-xs text-muted-foreground">{formatDate(policy.updatedAt)}</span>
          </Field>
          <Field label="ID">
            <code className="text-[11px] text-muted-foreground break-all">{policy.id}</code>
          </Field>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
          <CardDescription>
            Type-specific settings for this {policy.policyType} policy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No configuration set.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              {configEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-[200px_1fr] gap-3 border-b border-border/50 pb-2 last:border-0"
                >
                  <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
                  <dd className="font-mono text-xs break-all">
                    {Array.isArray(value)
                      ? value.length === 0
                        ? <span className="text-muted-foreground italic">empty</span>
                        : value.map((v) => String(v)).join(", ")
                      : typeof value === "object" && value !== null
                        ? <pre className="rounded bg-muted/50 px-2 py-1 overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>
                        : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>Permanently delete this policy. Cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2Icon className="size-4 mr-1.5" />
            Delete policy
          </Button>
        </CardContent>
      </Card>

      <EditPolicyDialog
        policy={policy}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => {
          setEditOpen(false);
          refetch();
        }}
      />

      <PolicyHistoryDialog
        policy={policy}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

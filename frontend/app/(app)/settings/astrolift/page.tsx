"use client";

import { withPermissionAuthenticationRequired } from "@/components/PermissionGuard";
import { authenticatedFetch } from "@/lib/auth/fetch";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckIcon, CopyIcon, PlusIcon, ServerIcon } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";

interface Cluster {
  id: string;
  cluster_id: string;
  provider: string;
  region: string;
  status: "pending" | "active" | "stale" | "revoked";
  health: string;
  last_seen_at: string | null;
  gateway_version: string;
  tenant_ids: string[];
  revoked_at: string | null;
}

interface Install {
  id: string;
  name: string;
  base_url: string;
  status: "connected" | "disconnected";
  tenant_ids: string[];
  connected_at: string;
  last_used_at: string | null;
  clusters: Cluster[];
}

interface EnrollmentCode {
  code: string;
  expires_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  connected: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  active: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  pending: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  stale: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  revoked: "bg-red-500/15 text-red-500 border-red-500/30",
  disconnected: "bg-red-500/15 text-red-500 border-red-500/30",
};

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

async function errorOf(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.detail ?? body?.error ?? fallback;
}

function AstroliftPage() {
  const confirmDialog = useConfirm();
  const [installs, setInstalls] = useState<Install[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentCode | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await authenticatedFetch(
        `${API_URL}/settings/astrolift`,
      );
      if (!response.ok)
        throw new Error(
          await errorOf(response, "Unable to load Astrolift installs"),
        );
      setInstalls((await response.json()).installs ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Unable to load Astrolift installs",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = async () => {
    setGenerating(true);
    try {
      const response = await authenticatedFetch(
        `${API_URL}/settings/astrolift/enrollment-codes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok)
        throw new Error(await errorOf(response, "Unable to generate a code"));
      setEnrollment(await response.json());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to generate a code",
      );
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = () => {
    if (!enrollment) return;
    navigator.clipboard.writeText(enrollment.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeCode = () => {
    setEnrollment(null);
    setCopied(false);
  };

  const revokeCluster = async (cluster: Cluster) => {
    const ok = await confirmDialog({
      title: `Revoke cluster ${cluster.cluster_id}?`,
      description:
        "Its gateway's credentials stop working at once, so agents in that cluster lose access to stored provider keys until Astrolift registers the cluster again.",
      confirmLabel: "Revoke",
    });
    if (!ok) return;
    const response = await authenticatedFetch(
      `${API_URL}/settings/astrolift/clusters/${cluster.id}`,
      { method: "DELETE" },
    );
    if (response.ok) toast.success(`Revoked ${cluster.cluster_id}`);
    else toast.error(await errorOf(response, "Unable to revoke the cluster"));
    await refresh();
  };

  const disconnect = async (install: Install) => {
    const ok = await confirmDialog({
      title: `Disconnect ${install.name}?`,
      description:
        "The install's credential and every one of its clusters' gateway credentials stop working at once. Reconnecting takes a new enrollment code.",
      confirmLabel: "Disconnect",
    });
    if (!ok) return;
    const response = await authenticatedFetch(
      `${API_URL}/settings/astrolift/installs/${install.id}`,
      { method: "DELETE" },
    );
    if (response.ok) toast.success(`Disconnected ${install.name}`);
    else
      toast.error(await errorOf(response, "Unable to disconnect the install"));
    await refresh();
  };

  const zentinelleUrl =
    typeof window === "undefined"
      ? ""
      : new URL(API_URL, window.location.href).origin;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Astrolift</h1>
          <p className="text-muted-foreground">
            Astrolift installs connected to this Zentinelle, and the clusters
            whose gateways they registered
          </p>
        </div>
        <Button onClick={generate} disabled={generating}>
          <PlusIcon className="mr-2 h-4 w-4" />
          {generating ? "Generating…" : "Generate enrollment code"}
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Loading…
        </p>
      ) : installs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ServerIcon className="text-muted-foreground mx-auto h-12 w-12" />
            <p className="text-muted-foreground mt-4 text-sm">
              No Astrolift install is connected. Generate an enrollment code and
              paste it into Astrolift with this Zentinelle&apos;s URL.
            </p>
          </CardContent>
        </Card>
      ) : (
        installs.map((install) => (
          <Card key={install.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    {install.name}
                    <Badge className={STATUS_STYLES[install.status]}>
                      {install.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">
                    {install.base_url}
                  </CardDescription>
                  <p className="text-muted-foreground text-xs">
                    Connected {when(install.connected_at)} · last call{" "}
                    {when(install.last_used_at)} · tenants{" "}
                    {install.tenant_ids.join(", ") || "none visible"}
                  </p>
                </div>
                {install.status === "connected" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void disconnect(install)}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {install.clusters.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No clusters registered yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cluster</TableHead>
                      <TableHead>Provider / region</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Last seen</TableHead>
                      <TableHead>Gateway</TableHead>
                      <TableHead>Tenants</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {install.clusters.map((cluster) => (
                      <TableRow key={cluster.id}>
                        <TableCell className="font-mono text-xs">
                          {cluster.cluster_id}
                        </TableCell>
                        <TableCell className="text-xs">
                          {[cluster.provider, cluster.region]
                            .filter(Boolean)
                            .join(" / ") || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_STYLES[cluster.status]}>
                            {cluster.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {cluster.health}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {when(cluster.last_seen_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {cluster.gateway_version || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {cluster.tenant_ids.join(", ") || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {cluster.status !== "revoked" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void revokeCluster(cluster)}
                            >
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog
        open={enrollment !== null}
        onOpenChange={(open) => !open && closeCode()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enrollment code</DialogTitle>
            <DialogDescription>
              Paste this Zentinelle URL and code into Astrolift. The code works
              once, until{" "}
              {enrollment
                ? new Date(enrollment.expires_at).toLocaleTimeString()
                : ""}
              , and is not shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-muted-foreground mb-1 text-xs">
                Zentinelle URL
              </p>
              <div className="bg-muted rounded-md p-3 font-mono text-xs break-all">
                {zentinelleUrl}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-xs">
                Enrollment code
              </p>
              <div className="bg-muted rounded-md p-3 font-mono text-xs break-all">
                {enrollment?.code}
              </div>
            </div>
            <Button onClick={copyCode} variant="outline" className="w-full">
              {copied ? (
                <>
                  <CheckIcon className="mr-2 h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <CopyIcon className="mr-2 h-4 w-4" /> Copy code
                </>
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={closeCode}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default withPermissionAuthenticationRequired(AstroliftPage, "admin");

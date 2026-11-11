"use client";

import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenuItem,
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  Section,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { ServerIcon } from "lucide-react";
import * as React from "react";

import { listController } from "./components/list-controller";
import { EnrollmentCodeDialog } from "./EnrollmentCodeDialog";
import {
  ASTROLIFT_TONE,
  HEALTH_TONE,
  formatDate,
  settingsCrumbs,
  type AstroliftCluster,
  type AstroliftInstall,
  type EnrollmentCode,
  type Loadable,
} from "./model";

export interface IntegrationsScreenProps {
  /** GET settings/astrolift. */
  installs: Loadable<readonly AstroliftInstall[]>;
  zentinelleUrl: string;
  /** POST settings/astrolift/enrollment-codes. */
  onGenerateCode: () => Promise<void>;
  generating?: boolean;
  /** The code just generated, shown in a dialog until closed. */
  code: EnrollmentCode | null;
  onCloseCode: () => void;
  /** DELETE settings/astrolift/installs/{id}, and clusters/{id}. */
  onDisconnect: (install: AstroliftInstall) => Promise<void>;
  onRevokeCluster: (cluster: AstroliftCluster) => Promise<void>;
}

const clusterColumns: Column<AstroliftCluster>[] = [
  {
    id: "cluster",
    header: "Cluster",
    cell: (c) => (
      <code className="font-mono text-xs [overflow-wrap:anywhere]">
        {c.cluster_id}
      </code>
    ),
  },
  {
    id: "where",
    header: "Provider and region",
    width: "w-40",
    cell: (c) => `${c.provider} ${c.region}`,
  },
  {
    id: "status",
    header: "Status",
    width: "w-28",
    cell: (c) => (
      <StatusBadge tone={ASTROLIFT_TONE[c.status] ?? "muted"}>
        {c.status}
      </StatusBadge>
    ),
  },
  {
    id: "health",
    header: "Health",
    width: "w-28",
    cell: (c) => (
      <StatusBadge tone={HEALTH_TONE[c.health] ?? "muted"}>
        {c.health || "unknown"}
      </StatusBadge>
    ),
  },
  {
    id: "seen",
    header: "Last seen",
    width: "w-44",
    cell: (c) => <span className="text-xs">{formatDate(c.last_seen_at)}</span>,
  },
  {
    id: "gateway",
    header: "Gateway",
    width: "w-24",
    cell: (c) => (
      <span className="font-mono text-xs">{c.gateway_version || "None"}</span>
    ),
  },
];

/**
 * Settings > Integrations (`/settings/astrolift`): the Astrolift AI
 * installs connected to this Zentinelle AI, and the clusters whose gateways
 * they registered. One section per install, its clusters in a table.
 */
export function IntegrationsScreen({
  installs,
  zentinelleUrl,
  onGenerateCode,
  generating = false,
  code,
  onCloseCode,
  onDisconnect,
  onRevokeCluster,
}: IntegrationsScreenProps) {
  const [disconnecting, setDisconnecting] =
    React.useState<AstroliftInstall | null>(null);
  const [revoking, setRevoking] = React.useState<AstroliftCluster | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const body = installs.error ? (
    <ErrorState
      title="Could not load Astrolift AI installs"
      error={installs.error}
      onRetry={installs.retry}
    />
  ) : installs.loading || installs.data === null ? (
    <LoadingState label="Loading Astrolift AI installs" rows={4} />
  ) : installs.data.length === 0 ? (
    <EmptyState
      icon={<ServerIcon aria-hidden className="size-6" />}
      title="No Astrolift AI install is connected"
      description="Generate an enrollment code and paste it into Astrolift AI with this Zentinelle AI's URL."
    />
  ) : (
    installs.data.map((install) => (
      <Section
        key={install.id}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {install.name}
            <StatusBadge tone={ASTROLIFT_TONE[install.status] ?? "muted"}>
              {install.status}
            </StatusBadge>
          </span>
        }
        description={
          <>
            <code className="font-mono text-xs [overflow-wrap:anywhere]">
              {install.base_url}
            </code>
            <span className="block text-xs">
              Connected {formatDate(install.connected_at)}; last call{" "}
              {formatDate(install.last_used_at)}; tenants{" "}
              {install.tenant_ids.join(", ") || "none visible"}
            </span>
          </>
        }
        action={
          install.status === "connected" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Disconnect ${install.name}`}
              onClick={() => setDisconnecting(install)}
            >
              Disconnect
            </Button>
          ) : undefined
        }
      >
        <DataTable
          label={`Clusters of ${install.name}`}
          chrome="table"
          controller={listController({ rows: install.clusters })}
          columns={clusterColumns}
          getRowId={(c) => c.id}
          rowLabel={(c) => `cluster ${c.cluster_id}`}
          empty={{
            title: "No clusters registered yet",
            description:
              "A cluster appears once its gateway registers through this install.",
          }}
          rowActions={(c) =>
            c.status === "revoked" ? undefined : (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setRevoking(c)}
              >
                Revoke
              </DropdownMenuItem>
            )
          }
        />
      </Section>
    ))
  );
  return (
    <PageFrame
      crumbs={settingsCrumbs("integrations")}
      title="Integrations"
      description="Astrolift AI installs connected to this Zentinelle AI, and the clusters whose gateways they registered."
      primaryAction={
        <Button
          type="button"
          disabled={generating}
          onClick={async () => {
            setError(null);
            try {
              await onGenerateCode();
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Could not generate a code.",
              );
            }
          }}
        >
          {generating ? "Generating" : "Generate enrollment code"}
        </Button>
      }
      notice={
        error && <ErrorState title="Could not generate a code" error={error} />
      }
    >
      {body}
      <EnrollmentCodeDialog
        code={code}
        zentinelleUrl={zentinelleUrl}
        onClose={onCloseCode}
      />
      <ConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(open) => !open && setDisconnecting(null)}
        destructive
        title={`Disconnect ${disconnecting?.name}?`}
        description="The install's credential and the gateway credentials of every one of its clusters stop working at once. Reconnecting takes a new enrollment code."
        confirmLabel="Disconnect"
        onConfirm={() => disconnecting && onDisconnect(disconnecting)}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        destructive
        title={`Revoke cluster ${revoking?.cluster_id}?`}
        description="Its gateway's credentials stop working at once, so agents in that cluster lose access to stored provider keys until Astrolift AI registers the cluster again."
        confirmLabel="Revoke cluster"
        onConfirm={() => revoking && onRevokeCluster(revoking)}
      />
    </PageFrame>
  );
}

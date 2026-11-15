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
import { useTranslations } from "next-intl";

import { listController } from "./components/list-controller";
import { EnrollmentCodeDialog } from "./EnrollmentCodeDialog";
import {
  ASTROLIFT_TONE,
  HEALTH_TONE,
  settingsCrumbs,
  type AstroliftCluster,
  type AstroliftInstall,
  type EnrollmentCode,
  type Loadable,
  useSettingsLabels,
  formatDate,
} from "./model";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

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

const clusterColumns = (t: Translate): Column<AstroliftCluster>[] => [
  {
    id: "cluster",
    header: t("cluster"),
    cell: (c) => (
      <code className="font-mono text-xs [overflow-wrap:anywhere]">
        {c.cluster_id}
      </code>
    ),
  },
  {
    id: "where",
    header: t("providerAndRegion"),
    width: "w-40",
    cell: (c) => `${c.provider} ${c.region}`,
  },
  {
    id: "status",
    header: t("status"),
    width: "w-28",
    cell: (c) => (
      <StatusBadge tone={ASTROLIFT_TONE[c.status] ?? "muted"}>
        {c.status}
      </StatusBadge>
    ),
  },
  {
    id: "health",
    header: t("health"),
    width: "w-28",
    cell: (c) => (
      <StatusBadge tone={HEALTH_TONE[c.health] ?? "muted"}>
        {c.health || "unknown"}
      </StatusBadge>
    ),
  },
  {
    id: "seen",
    header: t("lastSeen"),
    width: "w-44",
    cell: (c) => (
      <span className="text-xs">{formatDate(c.last_seen_at, t("never"))}</span>
    ),
  },
  {
    id: "gateway",
    header: t("gateway"),
    width: "w-24",
    cell: (c) => (
      <span className="font-mono text-xs">
        {c.gateway_version || t("none")}
      </span>
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
  const t = useTranslations("settings.integrationsScreen");
  const { formatDate } = useSettingsLabels();
  const [disconnecting, setDisconnecting] =
    React.useState<AstroliftInstall | null>(null);
  const [revoking, setRevoking] = React.useState<AstroliftCluster | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const body = installs.error ? (
    <ErrorState
      title={t("couldNotLoadAstroliftAi")}
      error={installs.error}
      onRetry={installs.retry}
    />
  ) : installs.loading || installs.data === null ? (
    <LoadingState label={t("loadingAstroliftAiInstalls")} rows={4} />
  ) : installs.data.length === 0 ? (
    <EmptyState
      icon={<ServerIcon aria-hidden className="size-6" />}
      title={t("noAstroliftAiInstallIs")}
      description={t("generateAnEnrollmentCodeAnd")}
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
              {t("installLine", {
                connected: formatDate(install.connected_at),
                used: formatDate(install.last_used_at),
                tenants: install.tenant_ids.join(", ") || t("noneVisible"),
              })}
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
              {t("disconnect")}
            </Button>
          ) : undefined
        }
      >
        <DataTable
          label={t("clustersOf", { name: install.name })}
          chrome="table"
          controller={listController({ rows: install.clusters })}
          columns={clusterColumns(t)}
          getRowId={(c) => c.id}
          rowLabel={(c) => t("clusterRow", { id: c.cluster_id })}
          empty={{
            title: t("noClustersRegisteredYet"),
            description: t("aClusterAppearsOnceIts"),
          }}
          rowActions={(c) =>
            c.status === "revoked" ? undefined : (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setRevoking(c)}
              >
                {t("revoke")}
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
      title={t("integrations")}
      description={t("astroliftAiInstallsConnectedTo")}
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
                  : t("couldNotGenerateACode2"),
              );
            }
          }}
        >
          {generating ? t("generating") : t("generateEnrollmentCode")}
        </Button>
      }
      notice={
        error && <ErrorState title={t("couldNotGenerateACode")} error={error} />
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
        description={t("theInstallSCredentialAnd")}
        confirmLabel={t("disconnect")}
        onConfirm={() => disconnecting && onDisconnect(disconnecting)}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        destructive
        title={t("revokeCluster", { id: revoking?.cluster_id ?? "" })}
        description={t("itsGatewaySCredentialsStop")}
        confirmLabel={t("revokeCluster")}
        onConfirm={() => revoking && onRevokeCluster(revoking)}
      />
    </PageFrame>
  );
}

"use client";

import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenuItem,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { KeyRoundIcon } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";

import { CopyField } from "../../shared/CopyField";
import { useListController } from "../../shared/list-controller";
import { CreateApiKeyDialog } from "./CreateApiKeyDialog";
import {
  API_KEY_TONE,
  settingsCrumbs,
  type ApiKey,
  type CreatedApiKey,
  type Loadable,
  useSettingsLabels,
  formatDate,
} from "./model";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface ApiKeysScreenProps {
  /** ApiKeys(search, status). */
  keys: Loadable<readonly ApiKey[]>;
  search: string;
  onSearchChange: (search: string) => void;
  /** CreatePlatformAPIKey; throws with the server's `error`. The route then passes the key as `created`. */
  onCreate: (input: { name: string; scopes: string[] }) => Promise<void>;
  /** RevokeApiKey and DeleteApiKey; each throws with the server's `error`. */
  onRevoke: (key: ApiKey) => Promise<void>;
  onDelete: (key: ApiKey) => Promise<void>;
  /** The key just created: the one moment its secret is visible. */
  created?: CreatedApiKey | null;
  onDismissCreated?: () => void;
}

const columns = (t: Translate): Column<ApiKey>[] => [
  {
    id: "name",
    header: t("name"),
    cell: (k) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{k.name}</p>
        {k.description && (
          <p className="truncate text-xs text-muted-foreground">
            {k.description}
          </p>
        )}
      </div>
    ),
  },
  {
    id: "prefix",
    header: t("key"),
    width: "w-36",
    cell: (k) => <code className="font-mono text-xs">{k.keyPrefix}…</code>,
  },
  {
    id: "scopes",
    header: t("scopes"),
    width: "w-36",
    cell: (k) => (
      <span className="font-mono text-xs">{k.scopes.join(", ")}</span>
    ),
  },
  {
    id: "status",
    header: t("status"),
    width: "w-28",
    cell: (k) => (
      <StatusBadge tone={API_KEY_TONE[k.status] ?? "muted"}>
        {k.status}
      </StatusBadge>
    ),
  },
  {
    id: "used",
    header: t("lastUsed"),
    width: "w-44",
    cell: (k) => (
      <span className="text-xs">{formatDate(k.lastUsedAt, t("never"))}</span>
    ),
  },
  {
    id: "created",
    header: t("created"),
    width: "w-44",
    cell: (k) => (
      <span className="text-xs">
        {formatDate(k.createdAt, t("never"))}
        {k.createdByUsername && (
          <span className="block text-muted-foreground">
            by {k.createdByUsername}
          </span>
        )}
      </span>
    ),
  },
];

/** Settings > API keys (`/settings/api-keys`): platform keys for scripts and services. */
export function ApiKeysScreen({
  keys,
  search,
  onSearchChange,
  onCreate,
  onRevoke,
  onDelete,
  created,
  onDismissCreated,
}: ApiKeysScreenProps) {
  const t = useTranslations("settings.apiKeysScreen");
  const [creating, setCreating] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{
    key: ApiKey;
    action: "revoke" | "delete";
  } | null>(null);
  const controller = useListController({
    rows: keys.data ?? [],
    loading: keys.loading,
    error: keys.error,
    onRetry: keys.retry,
    search,
    onSearchChange,
  });
  return (
    <PageFrame
      crumbs={settingsCrumbs("api-keys")}
      title={t("apiKeys")}
      description={t("keysForScriptsAndServices")}
      primaryAction={
        <Button type="button" onClick={() => setCreating(true)}>
          {t("newApiKey")}
        </Button>
      }
      notice={
        created && (
          <div
            role="status"
            className="grid gap-2 rounded-lg border border-warning-border bg-warning/5 p-4"
          >
            <p className="text-sm font-medium">
              {t("copyNow", { name: created.name })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("itIsShownOnlyOnce")}
            </p>
            <CopyField label={t("copyApiKey")} value={created.apiKey} />
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onDismissCreated}
              >
                {t("iHaveCopiedIt")}
              </Button>
            </div>
          </div>
        )
      }
    >
      <DataTable
        label={t("apiKeys")}
        controller={controller}
        columns={columns(t)}
        getRowId={(k) => k.id}
        rowLabel={(k) => t("rowLabel", { name: k.name })}
        searchPlaceholder={t("searchKeysByName")}
        empty={{
          icon: <KeyRoundIcon aria-hidden className="size-6" />,
          title: t("noApiKeysYet"),
          description: t("createAKeyForEach"),
        }}
        emptyFiltered={{
          title: t("noKeyMatches"),
          description: t("tryAnotherNameOrClear"),
        }}
        rowActions={(k) => (
          <>
            {k.status === "active" && (
              <DropdownMenuItem
                onSelect={() => setConfirm({ key: k, action: "revoke" })}
              >
                {t("revoke")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirm({ key: k, action: "delete" })}
            >
              {t("delete")}
            </DropdownMenuItem>
          </>
        )}
      />
      <CreateApiKeyDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={async (input) => {
          await onCreate(input);
          setCreating(false);
        }}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        destructive
        title={
          confirm?.action === "delete"
            ? `Delete ${confirm.key.name}?`
            : `Revoke ${confirm?.key.name}?`
        }
        description={
          confirm?.action === "delete"
            ? t("theKeyStopsWorkingAt")
            : t("theKeyStopsWorkingAt2")
        }
        confirmLabel={
          confirm?.action === "delete" ? t("deleteKey") : t("revokeKey")
        }
        onConfirm={() =>
          confirm?.action === "delete"
            ? onDelete(confirm.key)
            : confirm && onRevoke(confirm.key)
        }
      />
    </PageFrame>
  );
}

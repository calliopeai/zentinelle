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

import { CopyField } from "../../shared/CopyField";
import { listController } from "../../shared/list-controller";
import { CreateApiKeyDialog } from "./CreateApiKeyDialog";
import {
  API_KEY_TONE,
  formatDate,
  settingsCrumbs,
  type ApiKey,
  type CreatedApiKey,
  type Loadable,
} from "./model";

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

const columns: Column<ApiKey>[] = [
  {
    id: "name",
    header: "Name",
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
    header: "Key",
    width: "w-36",
    cell: (k) => <code className="font-mono text-xs">{k.keyPrefix}…</code>,
  },
  {
    id: "scopes",
    header: "Scopes",
    width: "w-36",
    cell: (k) => (
      <span className="font-mono text-xs">{k.scopes.join(", ")}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "w-28",
    cell: (k) => (
      <StatusBadge tone={API_KEY_TONE[k.status] ?? "muted"}>
        {k.status}
      </StatusBadge>
    ),
  },
  {
    id: "used",
    header: "Last used",
    width: "w-44",
    cell: (k) => <span className="text-xs">{formatDate(k.lastUsedAt)}</span>,
  },
  {
    id: "created",
    header: "Created",
    width: "w-44",
    cell: (k) => (
      <span className="text-xs">
        {formatDate(k.createdAt)}
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
  const [creating, setCreating] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{
    key: ApiKey;
    action: "revoke" | "delete";
  } | null>(null);
  const controller = listController({
    rows: keys.data,
    loading: keys.loading,
    error: keys.error,
    retry: keys.retry,
    isFiltered: search.trim() !== "",
    clearFilters: () => onSearchChange(""),
    search: { value: search, onChange: onSearchChange },
  });
  return (
    <PageFrame
      crumbs={settingsCrumbs("api-keys")}
      title="API keys"
      description="Keys for scripts and services that call the Zentinelle AI API."
      primaryAction={
        <Button type="button" onClick={() => setCreating(true)}>
          New API key
        </Button>
      }
      notice={
        created && (
          <div
            role="status"
            className="grid gap-2 rounded-lg border border-warning-border bg-warning/5 p-4"
          >
            <p className="text-sm font-medium">
              Copy the key for {created.name} now
            </p>
            <p className="text-xs text-muted-foreground">
              It is shown only once. Zentinelle AI keeps only its prefix.
            </p>
            <CopyField label="Copy API key" value={created.apiKey} />
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onDismissCreated}
              >
                I have copied it
              </Button>
            </div>
          </div>
        )
      }
    >
      <DataTable
        label="API keys"
        controller={controller}
        columns={columns}
        getRowId={(k) => k.id}
        rowLabel={(k) => `key ${k.name}`}
        searchPlaceholder="Search keys by name"
        empty={{
          icon: <KeyRoundIcon aria-hidden className="size-6" />,
          title: "No API keys yet",
          description:
            "Create a key for each script or service, so revoking one stops only that caller.",
        }}
        emptyFiltered={{
          title: "No key matches",
          description: "Try another name, or clear the search.",
        }}
        rowActions={(k) => (
          <>
            {k.status === "active" && (
              <DropdownMenuItem
                onSelect={() => setConfirm({ key: k, action: "revoke" })}
              >
                Revoke
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirm({ key: k, action: "delete" })}
            >
              Delete
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
            ? "The key stops working at once and leaves this list. Its audit history stays."
            : "The key stops working at once. It stays in this list as revoked, for the audit trail."
        }
        confirmLabel={
          confirm?.action === "delete" ? "Delete key" : "Revoke key"
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

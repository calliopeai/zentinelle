"use client";

import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  List,
  ListItem,
  LoadingState,
  PageFrame,
  Section,
  StatusBadge,
} from "@calliopelabs/ui";
import { PlugIcon } from "lucide-react";
import * as React from "react";

import { AccessDenied } from "../../shared/AccessDenied";
import { SelectField } from "../../shared/SelectField";
import { KpiTile, KpiRow } from "../../shared/KpiTile";
import { Switch } from "../../shared/Switch";
import { formatDay } from "../../shared/figures";
import { areaCrumbs, can } from "./frame";
import { ProviderKeyDialog } from "./ProviderKeyDialog";
import { ProviderModelsDialog } from "./ProviderModelsDialog";
import {
  PROVIDER_CATEGORIES,
  type ProviderCategory,
  type ProviderModel,
  type ProviderRow,
} from "./providers";

export type ProviderFilter = "all" | "configured" | ProviderCategory;

const FILTERS: { value: ProviderFilter; label: string }[] = [
  { value: "all", label: "All providers" },
  { value: "configured", label: "Configured" },
  ...PROVIDER_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
];

export interface ProvidersScreenProps {
  capabilities: readonly string[];
  /** `toProviderRows(GET /assistant/providers, GET /settings/llm-providers)`. */
  providers: readonly ProviderRow[];
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  filter: ProviderFilter;
  onFilterChange: (filter: ProviderFilter) => void;
  onSaveKey: (provider: string, apiKey: string) => Promise<unknown> | unknown;
  onRemoveKey: (provider: string) => Promise<unknown> | unknown;
  onToggleAssistant: (provider: string, enabled: boolean) => void;
  /** The models dialog: which provider, and `GET /assistant/models` for it (null while loading). */
  modelsDialog: {
    provider: string;
    models: readonly ProviderModel[] | null;
    error?: { message: string } | null;
  } | null;
  onModelsDialogChange: (provider: string | null) => void;
  onSaveModels: (
    provider: string,
    enabledModelIds: string[],
  ) => Promise<unknown> | unknown;
  locale?: string;
}

/**
 * Models > Providers (`/models/providers`, formerly
 * `/settings/llm-providers`, admin): the organization's provider keys, which
 * take priority over environment keys, and which models each offers the
 * assistant.
 */
export function ProvidersScreen({
  capabilities,
  providers,
  loading,
  error,
  onRetry,
  filter,
  onFilterChange,
  onSaveKey,
  onRemoveKey,
  onToggleAssistant,
  modelsDialog,
  onModelsDialogChange,
  onSaveModels,
  locale = "en",
}: ProvidersScreenProps) {
  const [editing, setEditing] = React.useState<ProviderRow | null>(null);
  const [removing, setRemoving] = React.useState<ProviderRow | null>(null);
  const admin = can(capabilities, "admin");
  const configured = providers.filter((p) => p.active).length;
  const stored = providers.filter((p) => p.storedKey).length;
  const shown = providers.filter((p) =>
    filter === "all"
      ? true
      : filter === "configured"
        ? p.active
        : p.category === filter,
  );
  const labelOf = (id: string) =>
    providers.find((p) => p.id === id)?.label ?? id;

  const body = () => {
    if (error)
      return (
        <ErrorState
          title="Could not load providers"
          error={error}
          onRetry={onRetry}
        />
      );
    if (loading && providers.length === 0)
      return <LoadingState label="Loading providers" rows={6} />;
    if (shown.length === 0)
      return (
        <EmptyState
          icon={<PlugIcon />}
          title={
            filter === "configured"
              ? "No provider is configured yet"
              : "No providers in this group"
          }
          description="Add a key to any provider below, or set its environment variable on the server."
          secondary={
            <Button
              size="sm"
              variant="outline"
              onClick={() => onFilterChange("all")}
            >
              Show all providers
            </Button>
          }
        />
      );
    return PROVIDER_CATEGORIES.map((category) => {
      const rows = shown.filter((p) => p.category === category.key);
      if (rows.length === 0) return null;
      return (
        <Section key={category.key} title={category.label} headingLevel="h2">
          <List
            label={category.label}
            items={rows}
            getKey={(p) => p.id}
            empty={{ title: "No providers" }}
            renderItem={(p) => (
              <ListItem
                title={p.label}
                description={
                  p.storedKey ? (
                    <span className="font-mono text-xs">
                      Key starting {p.storedKey.keyPrefix}, updated{" "}
                      {formatDay(p.storedKey.updatedAt, locale)}
                    </span>
                  ) : p.envVar ? (
                    <span className="font-mono text-xs">
                      {p.urlOnly ? "Set" : "Or set"} {p.envVar} on the server
                    </span>
                  ) : (
                    "Add a key to use it"
                  )
                }
                status={
                  <StatusBadge tone={p.active ? "ok" : "muted"}>
                    {p.active ? "active" : "not configured"}
                  </StatusBadge>
                }
                actions={
                  p.storedKey ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Switch
                        label={`Available in the assistant for ${p.label}`}
                        checked={p.storedKey.enabledForAssistant}
                        onCheckedChange={(next) =>
                          onToggleAssistant(p.id, next)
                        }
                      />
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onModelsDialogChange(p.id)}
                        aria-label={`Models for ${p.label}`}
                      >
                        Models
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setEditing(p)}
                        aria-label={`Rotate the ${p.label} key`}
                      >
                        Rotate
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setRemoving(p)}
                        aria-label={`Remove the ${p.label} key`}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : p.urlOnly ? null : (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setEditing(p)}
                      aria-label={`Add a ${p.label} key`}
                    >
                      Add key
                    </Button>
                  )
                }
              />
            )}
          />
        </Section>
      );
    });
  };

  return (
    <PageFrame
      crumbs={areaCrumbs(capabilities, "providers")}
      title="Providers"
      description="Keys for the model providers agents and the assistant call. Keys stored here take priority over environment keys."
      filters={
        admin ? (
          <SelectField
            label="Show"
            value={filter}
            options={FILTERS}
            onChange={(v) => onFilterChange(v as ProviderFilter)}
          />
        ) : undefined
      }
    >
      {!admin ? (
        <AccessDenied
          what="Providers"
          role="admin"
          homeHref="/models"
          homeLabel="Back to Models"
        />
      ) : (
        <>
          {!error && (
            <KpiRow label="Provider keys">
              <KpiTile
                label="Configured"
                value={`${configured} of ${providers.length}`}
                hint="With a usable key, stored or from the environment"
                loading={loading && providers.length === 0}
              />
              <KpiTile
                label="Keys stored here"
                value={String(stored)}
                hint="Encrypted at rest"
                loading={loading && providers.length === 0}
              />
            </KpiRow>
          )}
          {body()}
          <ProviderKeyDialog
            key={editing?.id ?? "none"}
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            providerLabel={editing?.label ?? ""}
            rotating={Boolean(editing?.storedKey)}
            onSave={(key) => (editing ? onSaveKey(editing.id, key) : undefined)}
          />
          <ConfirmDialog
            open={removing !== null}
            onOpenChange={(open) => !open && setRemoving(null)}
            title={`Remove the ${removing?.label ?? ""} key?`}
            description="The stored key is deleted. Agents and the assistant fall back to the environment key, if the server has one."
            confirmLabel="Remove key"
            destructive
            onConfirm={() => (removing ? onRemoveKey(removing.id) : undefined)}
          />
          {modelsDialog && (
            <ProviderModelsDialog
              key={modelsDialog.provider}
              open
              onOpenChange={(open) => !open && onModelsDialogChange(null)}
              providerLabel={labelOf(modelsDialog.provider)}
              models={modelsDialog.models}
              error={modelsDialog.error}
              onRetry={() => onModelsDialogChange(modelsDialog.provider)}
              onSave={(ids) => onSaveModels(modelsDialog.provider, ids)}
              locale={locale}
            />
          )}
        </>
      )}
    </PageFrame>
  );
}

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
import { useTranslations } from "next-intl";

import { AccessDenied } from "../../shared/AccessDenied";
import { SelectField } from "../../shared/SelectField";
import { KpiTile, KpiRow } from "../../shared/KpiTile";
import { Switch } from "../../shared/Switch";
import { formatDay } from "../../shared/figures";
import { areaCrumbs, can } from "./frame";
import { ProviderKeyDialog } from "./ProviderKeyDialog";
import { ProviderModelsDialog } from "./ProviderModelsDialog";
import {
  type ProviderCategory,
  type ProviderModel,
  type ProviderRow,
  useProviderLabels,
} from "./providers";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type ProviderFilter = "all" | "configured" | ProviderCategory;

const FILTERS = (
  t: Translate,
  PROVIDER_CATEGORIES: readonly { key: ProviderCategory; label: string }[],
): { value: ProviderFilter; label: string }[] => [
  { value: "all", label: t("allProviders") },
  { value: "configured", label: t("configured") },
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
  const { PROVIDER_CATEGORIES } = useProviderLabels();
  const t = useTranslations("models.providersScreen");
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
          title={t("couldNotLoadProviders")}
          error={error}
          onRetry={onRetry}
        />
      );
    if (loading && providers.length === 0)
      return <LoadingState label={t("loadingProviders")} rows={6} />;
    if (shown.length === 0)
      return (
        <EmptyState
          icon={<PlugIcon />}
          title={
            filter === "configured"
              ? t("noProviderIsConfiguredYet")
              : t("noProvidersInThisGroup")
          }
          description={t("addAKeyToAny")}
          secondary={
            <Button
              size="sm"
              variant="outline"
              onClick={() => onFilterChange("all")}
            >
              {t("showAllProviders")}
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
            empty={{ title: t("noProviders") }}
            renderItem={(p) => (
              <ListItem
                title={p.label}
                description={
                  p.storedKey ? (
                    <span className="font-mono text-xs">
                      {t("keyStarting", {
                        prefix: p.storedKey.keyPrefix,
                        day: formatDay(p.storedKey.updatedAt, locale),
                      })}
                    </span>
                  ) : p.envVar ? (
                    <span className="font-mono text-xs">
                      {t(p.urlOnly ? "setEnv" : "orSetEnv", { env: p.envVar })}
                    </span>
                  ) : (
                    t("addAKeyToUse")
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
                        label={t("inAssistant", { provider: p.label })}
                        checked={p.storedKey.enabledForAssistant}
                        onCheckedChange={(next) =>
                          onToggleAssistant(p.id, next)
                        }
                      />
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onModelsDialogChange(p.id)}
                        aria-label={t("modelsFor", { provider: p.label })}
                      >
                        {t("models")}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setEditing(p)}
                        aria-label={t("rotateKey", { provider: p.label })}
                      >
                        {t("rotate")}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setRemoving(p)}
                        aria-label={t("removeKeyLabel", { provider: p.label })}
                      >
                        {t("remove")}
                      </Button>
                    </div>
                  ) : p.urlOnly ? null : (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setEditing(p)}
                      aria-label={t("addKey", { provider: p.label })}
                    >
                      {t("addKey")}
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
      title={t("providers")}
      description={t("keysForTheModelProviders")}
      filters={
        admin ? (
          <SelectField
            label={t("show")}
            value={filter}
            options={FILTERS(t, PROVIDER_CATEGORIES)}
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
          homeLabel={t("backToModels")}
        />
      ) : (
        <>
          {!error && (
            <KpiRow label={t("providerKeys")}>
              <KpiTile
                label={t("configured")}
                value={`${configured} of ${providers.length}`}
                hint={t("withAUsableKeyStored")}
                loading={loading && providers.length === 0}
              />
              <KpiTile
                label={t("keysStoredHere")}
                value={String(stored)}
                hint={t("encryptedAtRest")}
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
            title={t("removeKeyTitle", { provider: removing?.label ?? "" })}
            description={t("theStoredKeyIsDeleted")}
            confirmLabel={t("removeKey")}
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

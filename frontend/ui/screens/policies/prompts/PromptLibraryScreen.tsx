import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PageFrame,
  StatusBadge,
  useUI,
  type Column,
} from "@calliopelabs/ui";
import { LibraryIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";

import type { SystemPromptData } from "@/graphql/prompts/types";

import { FilterBar } from "../../../shared/FilterBar";
import { useListController } from "../../../shared/list-controller";
import { Select } from "../../../shared/Select";
import { accessOf } from "../access";
import { areaCrumb } from "../frame";
import { PROMPT_STATUS_TONE, usePolicyLabels } from "../labels";

export interface PromptLibraryScreenProps {
  capabilities: readonly string[];
  /** `GetSystemPrompts` with the search and filters below as its variables. */
  prompts: readonly SystemPromptData[];
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  /** `systemPromptType`. */
  type: string;
  onTypeChange: (type: string) => void;
  /** `featuredOnly`. */
  featuredOnly: boolean;
  onFeaturedOnlyChange: (featuredOnly: boolean) => void;
  /** `ForkSystemPrompt`; the route opens the copy. */
  onFork: (prompt: SystemPromptData) => Promise<unknown> | void;
  onDelete: (prompt: SystemPromptData) => Promise<unknown>;
}

/** Policies > Prompt library: the organization's reusable prompts. One editor opens each, blank, from a template or guided. */
export function PromptLibraryScreen({
  capabilities,
  prompts,
  loading,
  error,
  onRetry,
  search,
  onSearchChange,
  type,
  onTypeChange,
  featuredOnly,
  onFeaturedOnlyChange,
  onFork,
  onDelete,
}: PromptLibraryScreenProps) {
  const t = useTranslations("policies.promptLibraryScreen");
  const { formatDate, PROMPT_TYPE_OPTIONS } = usePolicyLabels();
  const { Link } = useUI();
  const { canEdit } = accessOf(capabilities);
  const [deleting, setDeleting] = React.useState<SystemPromptData | null>(null);
  const controller = useListController({
    rows: prompts,
    loading,
    error,
    onRetry,
    search,
    onSearchChange,
    filtered: Boolean(search || type || featuredOnly),
    onClearFilters: () => {
      onSearchChange("");
      onTypeChange("");
      onFeaturedOnlyChange(false);
    },
  });
  const columns: Column<SystemPromptData>[] = [
    {
      id: "name",
      header: t("prompt"),
      cell: (p) => (
        <div className="min-w-0 max-w-md">
          <div className="font-medium [overflow-wrap:anywhere]">
            {p.name ?? t("untitled")}
            {p.isFeatured && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                featured
              </span>
            )}
          </div>
          {p.description && (
            <div className="line-clamp-2 text-xs text-muted-foreground">
              {p.description}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "type",
      header: t("type"),
      width: "w-36",
      cell: (p) => p.promptTypeDisplay ?? p.promptType ?? "",
    },
    {
      id: "vars",
      header: t("variables"),
      width: "w-40",
      cell: (p) => (
        <span className="line-clamp-1 block max-w-40 font-mono text-xs [overflow-wrap:anywhere]">
          {(p.templateVariables ?? []).join(", ") || t("none")}
        </span>
      ),
    },
    {
      id: "status",
      header: t("status"),
      width: "w-28",
      cell: (p) => (
        <StatusBadge tone={PROMPT_STATUS_TONE[p.status ?? ""] ?? "muted"}>
          {p.statusDisplay ?? p.status ?? "unknown"}
        </StatusBadge>
      ),
    },
    {
      id: "version",
      header: t("version"),
      width: "w-20",
      align: "right",
      cell: (p) => <span className="font-mono">v{p.version ?? 1}</span>,
    },
    {
      id: "used",
      header: t("used"),
      width: "w-20",
      align: "right",
      cell: (p) => (
        <span className="font-mono tabular-nums">
          {(p.usageCount ?? 0).toLocaleString()}
        </span>
      ),
    },
    {
      id: "updated",
      header: t("updated"),
      width: "w-28",
      cell: (p) => formatDate(p.updatedAt),
    },
  ];
  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "prompts")]}
      title={t("promptLibrary")}
      description={t("systemPromptsPersonasAndTemplates")}
      primaryAction={
        canEdit ? (
          <Button asChild size="sm">
            <Link href="/system-prompts/new">
              <PlusIcon aria-hidden /> New prompt
            </Link>
          </Button>
        ) : undefined
      }
      menu={
        canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("moreWaysToStartA")}
              >
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/system-prompts/new?mode=template">
                  {t("fromATemplate")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/system-prompts/new?mode=guided">
                  {t("guided")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
    >
      <DataTable
        label={t("prompts")}
        controller={controller}
        columns={columns}
        getRowId={(p) => p.id}
        rowHref={(p) => `/system-prompts/${encodeURIComponent(p.id)}`}
        rowLabel={(p) => p.name ?? p.id}
        searchPlaceholder={t("searchPrompts")}
        toolbar={
          <FilterBar label={t("promptFilters")}>
            <Select
              aria-label={t("promptType")}
              options={[
                { value: "", label: t("allTypes") },
                ...PROMPT_TYPE_OPTIONS,
              ]}
              value={type}
              onValueChange={onTypeChange}
              className="w-44"
            />
            <Select
              aria-label={t("featured")}
              options={[
                { value: "all", label: t("allPrompts") },
                { value: "featured", label: t("featuredOnly") },
              ]}
              value={featuredOnly ? "featured" : "all"}
              onValueChange={(v) => onFeaturedOnlyChange(v === "featured")}
              className="w-36"
            />
          </FilterBar>
        }
        empty={{
          icon: <LibraryIcon />,
          title: t("theLibraryIsEmpty"),
          description: canEdit
            ? t("saveThePromptsYourAgents")
            : t("anOperatorOrAdministratorAdds"),
          ...(canEdit
            ? { actionHref: "/system-prompts/new", actionLabel: t("newPrompt") }
            : {}),
        }}
        emptyFiltered={{
          title: t("noPromptsMatch"),
          description: t("tryAnotherTypeOrClear"),
        }}
        rowActions={
          canEdit
            ? (p) => (
                <>
                  <DropdownMenuItem onSelect={() => void onFork(p)}>
                    {t("makeACopy")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeleting(p)}
                  >
                    {t("delete")}
                  </DropdownMenuItem>
                </>
              )
            : undefined
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this prompt"}?`}
        description={t("itLeavesTheLibraryFor")}
        confirmLabel={t("deletePrompt")}
        destructive
        onConfirm={() => (deleting ? onDelete(deleting) : undefined)}
      />
    </PageFrame>
  );
}

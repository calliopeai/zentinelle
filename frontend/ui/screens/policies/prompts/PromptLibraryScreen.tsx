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

import type { SystemPromptData } from "@/graphql/prompts/types";

import { FilterBar } from "../../../shared/FilterBar";
import { useListController } from "../../../shared/list-controller";
import { Select } from "../../../shared/Select";
import { accessOf } from "../access";
import { areaCrumb } from "../frame";
import { PROMPT_STATUS_TONE, PROMPT_TYPE_OPTIONS, formatDate } from "../labels";

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
      header: "Prompt",
      cell: (p) => (
        <div className="min-w-0 max-w-md">
          <div className="font-medium [overflow-wrap:anywhere]">
            {p.name ?? "Untitled"}
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
      header: "Type",
      width: "w-36",
      cell: (p) => p.promptTypeDisplay ?? p.promptType ?? "",
    },
    {
      id: "vars",
      header: "Variables",
      width: "w-40",
      cell: (p) => (
        <span className="line-clamp-1 block max-w-40 font-mono text-xs [overflow-wrap:anywhere]">
          {(p.templateVariables ?? []).join(", ") || "None"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: "w-28",
      cell: (p) => (
        <StatusBadge tone={PROMPT_STATUS_TONE[p.status ?? ""] ?? "muted"}>
          {p.statusDisplay ?? p.status ?? "unknown"}
        </StatusBadge>
      ),
    },
    {
      id: "version",
      header: "Version",
      width: "w-20",
      align: "right",
      cell: (p) => <span className="font-mono">v{p.version ?? 1}</span>,
    },
    {
      id: "used",
      header: "Used",
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
      header: "Updated",
      width: "w-28",
      cell: (p) => formatDate(p.updatedAt),
    },
  ];
  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "prompts")]}
      title="Prompt library"
      description="System prompts, personas and templates that policies and agents reuse."
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
                aria-label="More ways to start a prompt"
              >
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/system-prompts/new?mode=template">
                  From a template
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/system-prompts/new?mode=guided">Guided</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
    >
      <DataTable
        label="Prompts"
        controller={controller}
        columns={columns}
        getRowId={(p) => p.id}
        rowHref={(p) => `/system-prompts/${encodeURIComponent(p.id)}`}
        rowLabel={(p) => p.name ?? p.id}
        searchPlaceholder="Search prompts"
        toolbar={
          <FilterBar label="Prompt filters">
            <Select
              aria-label="Prompt type"
              options={[
                { value: "", label: "All types" },
                ...PROMPT_TYPE_OPTIONS,
              ]}
              value={type}
              onValueChange={onTypeChange}
              className="w-44"
            />
            <Select
              aria-label="Featured"
              options={[
                { value: "all", label: "All prompts" },
                { value: "featured", label: "Featured only" },
              ]}
              value={featuredOnly ? "featured" : "all"}
              onValueChange={(v) => onFeaturedOnlyChange(v === "featured")}
              className="w-36"
            />
          </FilterBar>
        }
        empty={{
          icon: <LibraryIcon />,
          title: "The library is empty",
          description: canEdit
            ? "Save the prompts your agents share, so a change reaches every agent that uses them."
            : "An operator or administrator adds prompts. They show here once they exist.",
          ...(canEdit
            ? { actionHref: "/system-prompts/new", actionLabel: "New prompt" }
            : {}),
        }}
        emptyFiltered={{
          title: "No prompts match",
          description: "Try another type, or clear the search.",
        }}
        rowActions={
          canEdit
            ? (p) => (
                <>
                  <DropdownMenuItem onSelect={() => void onFork(p)}>
                    Make a copy
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeleting(p)}
                  >
                    Delete
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
        description="It leaves the library for everyone in the organization, and cannot be restored."
        confirmLabel="Delete prompt"
        destructive
        onConfirm={() => (deleting ? onDelete(deleting) : undefined)}
      />
    </PageFrame>
  );
}

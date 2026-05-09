"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@apollo/client/react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  PlusIcon,
  MoreHorizontalIcon,
  EyeIcon,
  PencilIcon,
  Trash2Icon,
  BadgeCheckIcon,
  SparklesIcon,
  GitForkIcon,
  WandSparklesIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useSystemPrompts } from "@/graphql/prompts/hooks";
import {
  DELETE_SYSTEM_PROMPT,
  FORK_SYSTEM_PROMPT,
} from "@/graphql/prompts/mutations";
import { GET_SYSTEM_PROMPTS } from "@/graphql/prompts/queries";
import type {
  SystemPromptData,
  DeleteSystemPromptData,
  DeleteSystemPromptVariables,
  ForkSystemPromptData,
  ForkSystemPromptVariables,
} from "@/graphql/prompts/types";

import {
  DataTable,
  DataTableColumnHeader,
  type FilterConfig,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PromptDetailDialog } from "./prompt-detail-dialog";
import { PromptAnalysisSheet } from "./prompt-analysis-sheet";

function visibilityVariant(visibility: string | null) {
  switch (visibility) {
    case "public":
      return "default" as const;
    case "private":
      return "outline" as const;
    case "shared":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function formatTimestamp(ts: string | null) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString();
}

export default function SystemPromptsPage() {
  const router = useRouter();
  const { prompts, loading } = useSystemPrompts();
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPromptData | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<SystemPromptData | null>(
    null,
  );
  const [analyzingPrompt, setAnalyzingPrompt] = useState<SystemPromptData | null>(
    null,
  );
  const [forkingId, setForkingId] = useState<string | null>(null);

  const [deletePrompt, { loading: deleting }] = useMutation<
    DeleteSystemPromptData,
    DeleteSystemPromptVariables
  >(DELETE_SYSTEM_PROMPT, {
    refetchQueries: [{ query: GET_SYSTEM_PROMPTS }],
  });

  const [forkPrompt] = useMutation<
    ForkSystemPromptData,
    ForkSystemPromptVariables
  >(FORK_SYSTEM_PROMPT, {
    refetchQueries: [{ query: GET_SYSTEM_PROMPTS }],
    awaitRefetchQueries: true,
  });

  const handleFork = async (prompt: SystemPromptData) => {
    setForkingId(prompt.id);
    try {
      const { data } = await forkPrompt({ variables: { id: prompt.id } });
      const result = data?.forkSystemPrompt;
      if (result?.success && result.prompt) {
        toast.success(`Forked "${prompt.name ?? "prompt"}"`);
        router.push(`/system-prompts/builder?id=${result.prompt.id}`);
      } else {
        toast.error(result?.errors?.[0] ?? "Failed to fork prompt");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fork");
    } finally {
      setForkingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      const { data } = await deletePrompt({
        variables: { id: pendingDelete.id },
      });
      if (data?.deleteSystemPrompt?.success) {
        toast.success(`Deleted "${pendingDelete.name ?? "prompt"}"`);
        setPendingDelete(null);
      } else {
        const err =
          data?.deleteSystemPrompt?.errors?.[0] ?? "Failed to delete prompt";
        toast.error(err);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const columns: ColumnDef<SystemPromptData, unknown>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name ?? "Untitled"}</span>
          {row.original.isFeatured && (
            <SparklesIcon className="h-3.5 w-3.5 text-amber-500" />
          )}
        </div>
      ),
    },
    {
      accessorKey: "promptType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.promptTypeDisplay ?? row.original.promptType ?? "--"}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.promptType === filterValue;
      },
    },
    {
      accessorKey: "visibility",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Visibility" />
      ),
      cell: ({ row }) => (
        <Badge variant={visibilityVariant(row.original.visibility)}>
          {row.original.visibilityDisplay ?? row.original.visibility ?? "--"}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.visibility === filterValue;
      },
    },
    {
      accessorKey: "isVerified",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Verified" />
      ),
      cell: ({ row }) =>
        row.original.isVerified ? (
          <span className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
            <BadgeCheckIcon className="h-4 w-4" />
            Verified
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">--</span>
        ),
    },
    {
      accessorKey: "recommendedTemperature",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Temp" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm tabular-nums">
          {row.original.recommendedTemperature != null
            ? row.original.recommendedTemperature.toFixed(2)
            : "--"}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatTimestamp(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontalIcon className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSelectedPrompt(row.original)}>
              <EyeIcon className="mr-2 h-4 w-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                router.push(`/system-prompts/builder?id=${row.original.id}`)
              }
            >
              <PencilIcon className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setAnalyzingPrompt(row.original)}
            >
              <WandSparklesIcon className="mr-2 h-4 w-4" />
              Analyze
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleFork(row.original)}
              disabled={forkingId === row.original.id}
            >
              <GitForkIcon className="mr-2 h-4 w-4" />
              {forkingId === row.original.id ? "Forking..." : "Fork"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setPendingDelete(row.original)}
              className="text-red-600 dark:text-red-400"
            >
              <Trash2Icon className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
    },
  ];

  const promptTypes = [
    ...new Set(prompts.map((p) => p.promptType).filter((v): v is string => !!v)),
  ].sort();
  const visibilities = [
    ...new Set(prompts.map((p) => p.visibility).filter((v): v is string => !!v)),
  ].sort();

  const filters: FilterConfig[] = [
    {
      id: "promptType",
      label: "Type",
      type: "select",
      options: promptTypes.map((t) => ({ value: t, label: t })),
    },
    {
      id: "visibility",
      label: "Visibility",
      type: "select",
      options: visibilities.map((v) => ({ value: v, label: v })),
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">System Prompts</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Browse and manage system prompt templates for your AI agents
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/system-prompts/create">
            <PlusIcon className="mr-1.5 h-4 w-4" />
            Create Prompt
          </Link>
        </Button>
      </div>

      <DataTable
        data={prompts}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search prompts..."
        onRowClick={(row) => setSelectedPrompt(row)}
      />

      <PromptDetailDialog
        prompt={selectedPrompt}
        open={selectedPrompt !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPrompt(null);
        }}
        onAnalyze={(prompt) => {
          setSelectedPrompt(null);
          setAnalyzingPrompt(prompt);
        }}
      />

      <PromptAnalysisSheet
        promptId={analyzingPrompt?.id ?? null}
        promptName={analyzingPrompt?.name ?? null}
        promptType={analyzingPrompt?.promptType ?? null}
        open={analyzingPrompt !== null}
        onOpenChange={(open) => {
          if (!open) setAnalyzingPrompt(null);
        }}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium">
                {pendingDelete?.name ?? "this prompt"}
              </span>
              . Agents currently referencing it may stop working. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

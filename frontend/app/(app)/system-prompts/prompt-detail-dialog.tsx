"use client";

import { useState } from "react";
import {
  CopyIcon,
  CheckIcon,
  SparklesIcon,
  BadgeCheckIcon,
  WandSparklesIcon,
} from "lucide-react";

import { useSystemPrompt } from "@/graphql/prompts/hooks";
import type { SystemPromptData } from "@/graphql/prompts/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

type PromptDetailDialogProps = {
  prompt: SystemPromptData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnalyze?: (prompt: SystemPromptData) => void;
};

export function PromptDetailDialog({
  prompt,
  open,
  onOpenChange,
  onAnalyze,
}: PromptDetailDialogProps) {
  const [copied, setCopied] = useState(false);

  // Fetch the full prompt (including promptText) when one is selected.
  const { prompt: fullPrompt, loading } = useSystemPrompt({
    id: prompt?.id ?? null,
  });

  if (!prompt) return null;

  // Prefer the freshly-fetched detail (has promptText) over the list row.
  const data = fullPrompt ?? prompt;

  const handleCopy = () => {
    if (!data.promptText) return;
    navigator.clipboard.writeText(data.promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                {data.name ?? "Untitled"}
                {data.isFeatured && (
                  <SparklesIcon className="h-4 w-4 text-amber-500" />
                )}
                {data.isVerified && (
                  <BadgeCheckIcon className="h-4 w-4 text-blue-500" />
                )}
              </DialogTitle>
              {data.description && (
                <DialogDescription>{data.description}</DialogDescription>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {data.promptTypeDisplay && (
                <Badge variant="outline">{data.promptTypeDisplay}</Badge>
              )}
              {data.visibility && (
                <Badge
                  variant={
                    data.visibility === "public" ? "default" : "outline"
                  }
                >
                  {data.visibilityDisplay ?? data.visibility}
                </Badge>
              )}
              {data.version != null && (
                <Badge variant="secondary">v{data.version}</Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <span className="text-muted-foreground">
                {data.category?.name ?? "--"}
              </span>
            </Field>
            <Field label="Recommended Temperature">
              <span className="tabular-nums">
                {data.recommendedTemperature != null
                  ? data.recommendedTemperature.toFixed(2)
                  : "--"}
              </span>
            </Field>
            <Field label="Recommended Max Tokens">
              <span className="tabular-nums">
                {data.recommendedMaxTokens ?? "--"}
              </span>
            </Field>
            <Field label="Usage Count">
              <span className="tabular-nums">{data.usageCount ?? 0}</span>
            </Field>
            <Field label="Created By">
              <span className="text-muted-foreground">
                {data.createdByUsername ?? "--"}
              </span>
            </Field>
            <Field label="Created">
              <span className="text-muted-foreground">
                {data.createdAt
                  ? new Date(data.createdAt).toLocaleString()
                  : "--"}
              </span>
            </Field>
          </div>

          {data.tags && data.tags.length > 0 && (
            <Field label="Tags">
              <div className="flex flex-wrap gap-1.5">
                {data.tags.map((tag) => (
                  <Badge key={tag.id} variant="outline" className="text-xs">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </Field>
          )}

          {data.compatibleProviders && data.compatibleProviders.length > 0 && (
            <Field label="Compatible Providers">
              <div className="flex flex-wrap gap-1.5">
                {data.compatibleProviders.map((p) => (
                  <Badge key={p} variant="secondary" className="text-xs">
                    {p}
                  </Badge>
                ))}
              </div>
            </Field>
          )}

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Prompt Text
              </p>
              <div className="flex items-center gap-1">
                {onAnalyze && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAnalyze(data)}
                    disabled={!data.promptText || loading}
                    className="h-7"
                  >
                    <WandSparklesIcon className="mr-1 h-3.5 w-3.5" />
                    Analyze
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!data.promptText || loading}
                  className="h-7"
                >
                  {copied ? (
                    <CheckIcon className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <CopyIcon className="mr-1 h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            {loading && !data.promptText ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <pre className="bg-muted/40 max-h-96 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {data.promptText || "(no prompt text)"}
              </pre>
            )}
          </div>

          {data.useCases && data.useCases.length > 0 && (
            <>
              <Separator />
              <Field label="Use Cases">
                <ul className="text-muted-foreground list-inside list-disc space-y-1">
                  {data.useCases.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </Field>
            </>
          )}

          {(data.exampleInput || data.exampleOutput) && (
            <>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                {data.exampleInput && (
                  <Field label="Example Input">
                    <pre className="bg-muted/40 max-h-48 overflow-auto rounded-md border p-2 text-xs whitespace-pre-wrap">
                      {data.exampleInput}
                    </pre>
                  </Field>
                )}
                {data.exampleOutput && (
                  <Field label="Example Output">
                    <pre className="bg-muted/40 max-h-48 overflow-auto rounded-md border p-2 text-xs whitespace-pre-wrap">
                      {data.exampleOutput}
                    </pre>
                  </Field>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

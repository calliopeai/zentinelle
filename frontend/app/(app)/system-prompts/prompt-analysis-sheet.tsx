"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  GaugeIcon,
  Loader2Icon,
  SparklesIcon,
  TriangleAlertIcon,
  WandSparklesIcon,
} from "lucide-react";

import { ANALYZE_SYSTEM_PROMPT } from "@/graphql/prompts/mutations";
import { GET_SYSTEM_PROMPT } from "@/graphql/prompts/queries";
import type {
  AnalyzeSystemPromptData,
  AnalyzeSystemPromptVariables,
  PromptImprovementSuggestion,
  SystemPromptDetailData,
  SystemPromptDetailVariables,
} from "@/graphql/prompts/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type PromptAnalysisSheetProps = {
  promptId: string | null;
  promptName?: string | null;
  promptType?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function severityVariant(
  severity: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  switch ((severity || "").toLowerCase()) {
    case "high":
    case "critical":
      return "destructive";
    case "medium":
    case "moderate":
      return "default";
    case "low":
    case "minor":
      return "secondary";
    default:
      return "outline";
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function ImprovementCard({
  improvement,
}: {
  improvement: PromptImprovementSuggestion;
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <TriangleAlertIcon className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-sm font-medium">
            {improvement.category ?? "Suggestion"}
          </span>
        </div>
        {improvement.severity && (
          <Badge variant={severityVariant(improvement.severity)} className="text-[10px]">
            {improvement.severity}
          </Badge>
        )}
      </div>

      {improvement.explanation && (
        <p className="text-muted-foreground text-sm leading-relaxed">
          {improvement.explanation}
        </p>
      )}

      {improvement.originalText && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            Original
          </p>
          <pre className="bg-muted/40 max-h-32 overflow-auto rounded border p-2 font-mono text-xs whitespace-pre-wrap">
            {improvement.originalText}
          </pre>
        </div>
      )}

      {improvement.suggestedText && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            Suggested
          </p>
          <pre className="rounded border border-emerald-500/40 bg-emerald-500/5 p-2 font-mono text-xs whitespace-pre-wrap dark:bg-emerald-500/10">
            {improvement.suggestedText}
          </pre>
        </div>
      )}
    </div>
  );
}

export function PromptAnalysisSheet({
  promptId,
  promptName,
  promptType,
  open,
  onOpenChange,
}: PromptAnalysisSheetProps) {
  const { data: promptData, loading: loadingPrompt } = useQuery<
    SystemPromptDetailData,
    SystemPromptDetailVariables
  >(GET_SYSTEM_PROMPT, {
    variables: { id: promptId },
    skip: !open || !promptId,
  });

  const [analyze, { data: analysisData, loading: analyzing, error: analysisError, reset }] =
    useMutation<AnalyzeSystemPromptData, AnalyzeSystemPromptVariables>(
      ANALYZE_SYSTEM_PROMPT,
    );

  const triggeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      triggeredFor.current = null;
      return;
    }
    const promptText = promptData?.systemPrompt?.promptText;
    if (!promptText || !promptId) return;
    if (triggeredFor.current === promptId) return;
    triggeredFor.current = promptId;
    reset();
    analyze({
      variables: {
        promptText,
        promptType: promptType ?? promptData?.systemPrompt?.promptType ?? "system",
      },
    }).catch(() => {});
  }, [open, promptId, promptData, promptType, analyze, reset]);

  const result = analysisData?.analyzeSystemPrompt;
  const isLoading = loadingPrompt || analyzing;
  const errorMessage = result?.error || (analysisError ? analysisError.message : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto p-6">
        <SheetHeader className="px-0">
          <SheetTitle className="flex items-center gap-2">
            <WandSparklesIcon className="h-4 w-4" />
            Prompt Analysis
          </SheetTitle>
          <SheetDescription>
            AI-driven feedback on{" "}
            <span className="font-medium text-foreground">
              {promptName ?? "this prompt"}
            </span>
            : clarity, safety risks, ambiguity, and token efficiency.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {isLoading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Analyzing prompt...
              </div>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {!isLoading && errorMessage && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <AlertCircleIcon className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-2">
                <p className="font-medium text-destructive">Analysis failed</p>
                <p className="text-muted-foreground">{errorMessage}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    triggeredFor.current = null;
                    const promptText = promptData?.systemPrompt?.promptText;
                    if (!promptText) return;
                    reset();
                    analyze({
                      variables: {
                        promptText,
                        promptType:
                          promptType ?? promptData?.systemPrompt?.promptType ?? "system",
                      },
                    }).catch(() => {});
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !errorMessage && result && result.success && (
            <>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                    <GaugeIcon className={`h-6 w-6 ${scoreColor(result.overallScore)}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Overall Score
                    </p>
                    <p className={`text-2xl font-semibold ${scoreColor(result.overallScore)}`}>
                      {result.overallScore}
                      <span className="text-muted-foreground ml-1 text-sm font-normal">/ 100</span>
                    </p>
                  </div>
                </div>
                {result.tokenEfficiency && (
                  <>
                    <Separator className="my-3" />
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                        Token Efficiency
                      </p>
                      <p className="text-sm">{result.tokenEfficiency}</p>
                    </div>
                  </>
                )}
              </div>

              {result.strengths.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Strengths ({result.strengths.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {result.strengths.map((strength, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-sm leading-relaxed dark:bg-emerald-500/10"
                      >
                        <CheckCircle2Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.improvements.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <SparklesIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    Suggested Improvements ({result.improvements.length})
                  </h3>
                  <div className="space-y-2">
                    {result.improvements.map((imp, i) => (
                      <ImprovementCard key={i} improvement={imp} />
                    ))}
                  </div>
                </div>
              )}

              {result.strengths.length === 0 && result.improvements.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No specific feedback returned. The prompt may already be in good shape.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

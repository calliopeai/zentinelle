"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@apollo/client/react";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CopyIcon,
  CheckIcon,
  SaveIcon,
  CodeIcon,
  UserIcon,
  ListChecksIcon,
  ShieldAlertIcon,
  BookOpenIcon,
  LayoutTemplateIcon,
  LinkIcon,
  VariableIcon,
  EyeIcon,
  XIcon,
  Loader2Icon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { CREATE_SYSTEM_PROMPT } from "@/graphql/prompts/mutations";
import type { CreateSystemPromptPayload } from "@/graphql/prompts/types";

// ---------------------------------------------------------------------------
// Template catalogue — covers the seven canonical prompt types
// ---------------------------------------------------------------------------

interface PromptTemplate {
  key: string;
  name: string;
  type: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  template: string;
  suggestions: Record<string, string[]>;
}

const TEMPLATES: PromptTemplate[] = [
  {
    key: "system",
    name: "System Prompt",
    type: "system",
    icon: <CodeIcon className="h-5 w-5" />,
    color: "text-blue-500",
    description: "Core instructions that define AI behavior and capabilities",
    template: `You are {{assistant_name}}, an AI assistant specialized in {{domain}}.

Your primary responsibilities:
- {{responsibility_1}}
- {{responsibility_2}}
- {{responsibility_3}}

Guidelines:
- Always maintain a {{tone}} tone
- Provide accurate and helpful information
- Ask clarifying questions when needed
- Acknowledge limitations honestly`,
    suggestions: {
      assistant_name: ["Atlas", "Nova", "Sentinel"],
      domain: ["software engineering", "data analysis", "customer support"],
      tone: ["professional and friendly", "formal and precise", "casual and approachable"],
    },
  },
  {
    key: "persona",
    name: "Persona / Role",
    type: "persona",
    icon: <UserIcon className="h-5 w-5" />,
    color: "text-purple-500",
    description: "Define a character, personality, and communication style",
    template: `You are {{character_name}}, a {{profession}} with {{years}} years of experience.

Background:
- Education: {{education}}
- Specialization: {{specialization}}

Communication style:
- Tone: {{tone}}
- Vocabulary: {{vocabulary_level}}
- Approach: {{approach}}

Stay in character throughout the conversation.`,
    suggestions: {
      profession: ["senior architect", "data scientist", "security analyst"],
      tone: ["mentoring and supportive", "direct and concise", "collaborative"],
      vocabulary_level: ["technical expert", "plain language", "academic"],
    },
  },
  {
    key: "task",
    name: "Task Template",
    type: "task",
    icon: <ListChecksIcon className="h-5 w-5" />,
    color: "text-green-500",
    description: "Structured instructions for a specific task with clear success criteria",
    template: `Task: {{task_name}}

Objective: {{objective}}

Input: {{input_description}}
Expected Output: {{output_description}}

Steps:
1. {{step_1}}
2. {{step_2}}
3. {{step_3}}

Quality criteria:
- {{criterion_1}}
- {{criterion_2}}`,
    suggestions: {
      task_name: ["Code Review", "Data Validation", "Report Generation"],
      objective: ["identify bugs and improvements", "verify data integrity", "produce executive summary"],
    },
  },
  {
    key: "safety",
    name: "Safety Guardrails",
    type: "safety",
    icon: <ShieldAlertIcon className="h-5 w-5" />,
    color: "text-red-500",
    description: "Define boundaries, restrictions, and prohibited behaviors",
    template: `Safety Guidelines:

NEVER:
- {{prohibited_1}}
- {{prohibited_2}}
- {{prohibited_3}}

ALWAYS:
- {{required_1}}
- {{required_2}}

Allowed topics: {{allowed_topics}}
Restricted topics: {{restricted_topics}}

When uncertain, {{fallback_behavior}}.`,
    suggestions: {
      prohibited_1: ["share personal data", "generate harmful content", "execute arbitrary code"],
      fallback_behavior: ["ask for clarification", "decline gracefully", "escalate to a human"],
    },
  },
  {
    key: "few_shot",
    name: "Few-Shot Examples",
    type: "few_shot",
    icon: <BookOpenIcon className="h-5 w-5" />,
    color: "text-orange-500",
    description: "Teach by example with input/output pairs for consistent responses",
    template: `Learn from these examples:

Example 1:
Input: {{example_1_input}}
Output: {{example_1_output}}

Example 2:
Input: {{example_2_input}}
Output: {{example_2_output}}

Example 3:
Input: {{example_3_input}}
Output: {{example_3_output}}

Now apply the same pattern to new inputs.`,
    suggestions: {
      example_1_input: ["Summarize this paragraph", "Classify this ticket"],
      example_1_output: ["A concise one-sentence summary", "Category: billing"],
    },
  },
  {
    key: "format",
    name: "Output Format",
    type: "format",
    icon: <LayoutTemplateIcon className="h-5 w-5" />,
    color: "text-cyan-500",
    description: "Control the structure and format of AI-generated responses",
    template: `Format your response as follows:

## {{section_1}}
[content]

## {{section_2}}
[content]

## {{section_3}}
[content]

Use {{formatting_style}} throughout.
Maximum length: {{max_length}} words.`,
    suggestions: {
      formatting_style: ["markdown with code blocks", "bullet points", "numbered steps"],
      max_length: ["200", "500", "1000"],
    },
  },
  {
    key: "chain",
    name: "Prompt Chain",
    type: "chain",
    icon: <LinkIcon className="h-5 w-5" />,
    color: "text-pink-500",
    description: "Multi-step prompt workflow with context passing between steps",
    template: `This is step {{step_number}} of {{total_steps}} in the workflow.

Previous context:
{{previous_output}}

Current task:
{{current_task}}

Instructions:
- Complete the current task using the previous context
- Format output for the next step
- Include metadata: step completed, confidence level

Pass to next step: {{output_for_next}}`,
    suggestions: {
      total_steps: ["3", "5", "7"],
      current_task: ["analyze input", "transform data", "generate summary"],
    },
  },
];

// ---------------------------------------------------------------------------
// Variable extraction helper
// ---------------------------------------------------------------------------

function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PromptBuilderPage() {
  const router = useRouter();
  const [copied, copy] = useCopyToClipboard();
  const [createPrompt, { loading: saving }] = useMutation<{
    createSystemPrompt: CreateSystemPromptPayload;
  }>(CREATE_SYSTEM_PROMPT);

  // State
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [promptContent, setPromptContent] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);

  // Save dialog state
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Derived
  const variables = useMemo(() => extractVariables(promptContent), [promptContent]);
  const tokenCount = useMemo(() => estimateTokens(promptContent), [promptContent]);
  const lineCount = (promptContent || "").split("\n").length;

  const previewContent = useMemo(() => {
    let content = promptContent;
    for (const [key, value] of Object.entries(variableValues)) {
      if (value) {
        content = content.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, "g"),
          value
        );
      }
    }
    return content;
  }, [promptContent, variableValues]);

  const handleTemplateSelect = useCallback(
    (template: PromptTemplate) => {
      setSelectedTemplate(template);
      setPromptContent(template.template);
      setVariableValues({});
      setShowPreview(false);
    },
    []
  );

  const handleClearTemplate = useCallback(() => {
    setSelectedTemplate(null);
    setPromptContent("");
    setVariableValues({});
    setShowPreview(false);
  }, []);

  const handleVariableChange = useCallback(
    (name: string, value: string) => {
      setVariableValues((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  const handleOpenSaveDialog = useCallback(() => {
    setSaveError(null);
    setSaveName(selectedTemplate?.name ?? "");
    setSaveOpen(true);
  }, [selectedTemplate]);

  const handleConfirmSave = useCallback(async () => {
    const trimmed = saveName.trim();
    if (trimmed.length < 3) {
      setSaveError("Name must be at least 3 characters");
      return;
    }
    if (!previewContent || previewContent.length < 10) {
      setSaveError("Prompt text must be at least 10 characters");
      return;
    }

    setSaveError(null);

    try {
      const { data } = await createPrompt({
        variables: {
          input: {
            name: trimmed,
            promptText: previewContent,
            promptType: selectedTemplate?.type ?? "system",
            visibility: "organization",
          },
        },
      });

      if (data?.createSystemPrompt?.prompt) {
        toast.success(`Prompt "${trimmed}" saved`);
        setSaveOpen(false);
        router.push("/system-prompts");
      } else {
        const err =
          data?.createSystemPrompt?.errors?.[0] ?? "Failed to save prompt";
        setSaveError(err);
        toast.error(err);
      }
    } catch {
      const err = "Failed to save prompt";
      setSaveError(err);
      toast.error(err);
    }
  }, [createPrompt, previewContent, router, saveName, selectedTemplate]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/system-prompts">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Prompt Builder</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Visual template editor with live preview and variable substitution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => copy(previewContent)}
            disabled={!promptContent}
          >
            {copied ? (
              <CheckIcon className="mr-1.5 h-4 w-4" />
            ) : (
              <CopyIcon className="mr-1.5 h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            size="sm"
            onClick={handleOpenSaveDialog}
            disabled={!promptContent || saving}
          >
            {saving ? (
              <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <SaveIcon className="mr-1.5 h-4 w-4" />
            )}
            Save as System Prompt
          </Button>
        </div>
      </div>

      {/* Main two-panel layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* ── Left panel: template selection ─────────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium">Templates</h2>
          <div className="space-y-2">
            {TEMPLATES.map((t) => {
              const isActive = selectedTemplate?.key === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleTemplateSelect(t)}
                  className={`ring-foreground/10 w-full rounded-xl p-3 text-left ring-1 transition-all ${
                    isActive
                      ? "bg-accent ring-primary/40 ring-2"
                      : "bg-card hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ${t.color}`}
                    >
                      {t.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                        {t.description}
                      </p>
                    </div>
                    {isActive && (
                      <CheckIcon className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedTemplate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearTemplate}
              className="w-full"
            >
              <XIcon className="mr-1.5 h-3.5 w-3.5" />
              Clear selection
            </Button>
          )}
        </div>

        {/* ── Right panel: editor + variables + preview ──────────────── */}
        <div className="space-y-6">
          {/* Editor */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">
                    {selectedTemplate ? selectedTemplate.name : "Prompt Editor"}
                  </CardTitle>
                  {selectedTemplate && (
                    <Badge variant="outline" className="text-[10px]">
                      {selectedTemplate.type}
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground flex items-center gap-3 text-xs">
                  <span>{lineCount} lines</span>
                  <span className="text-border">|</span>
                  <span>{promptContent.length} chars</span>
                  <span className="text-border">|</span>
                  <span>~{tokenCount} tokens</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="pointer-events-none absolute top-0 left-0 flex flex-col border-r px-2 py-2 text-right">
                  {Array.from({ length: lineCount }).map((_, i) => (
                    <span
                      key={i}
                      className="text-muted-foreground/50 font-mono text-sm leading-[1.7]"
                    >
                      {i + 1}
                    </span>
                  ))}
                </div>
                <Textarea
                  value={promptContent}
                  onChange={(e) => setPromptContent(e.target.value)}
                  placeholder="Start typing your prompt here, or select a template from the left panel..."
                  className="min-h-[280px] resize-y pl-12 font-mono text-sm"
                  style={{ lineHeight: "1.7" }}
                  rows={14}
                />
              </div>

              {/* Token counter bar */}
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {variables.length > 0 && (
                    <div className="flex items-center gap-1">
                      <VariableIcon className="text-muted-foreground h-3.5 w-3.5" />
                      <span className="text-muted-foreground text-xs">
                        {variables.length} variable{variables.length !== 1 ? "s" : ""} detected
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2 w-20 overflow-hidden rounded-full bg-muted`}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        tokenCount > 4000
                          ? "bg-red-500"
                          : tokenCount > 2000
                            ? "bg-yellow-500"
                            : "bg-[#37efed]"
                      }`}
                      style={{
                        width: `${Math.min((tokenCount / 4096) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-muted-foreground text-xs">
                    ~{tokenCount.toLocaleString()} / 4,096
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Template variables */}
          {variables.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Template Variables</CardTitle>
                <CardDescription className="text-xs">
                  Fill in values for each <code className="bg-muted rounded px-1 py-0.5">{`{{variable}}`}</code> to see the rendered prompt below
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {variables.map((v) => {
                    const suggestions =
                      selectedTemplate?.suggestions?.[v] ?? [];
                    return (
                      <div key={v} className="space-y-1.5">
                        <Label
                          htmlFor={`var-${v}`}
                          className="font-mono text-xs"
                        >
                          {`{{${v}}}`}
                        </Label>
                        <Input
                          id={`var-${v}`}
                          value={variableValues[v] ?? ""}
                          onChange={(e) =>
                            handleVariableChange(v, e.target.value)
                          }
                          placeholder={
                            suggestions.length > 0
                              ? suggestions[0]
                              : `Enter ${v.replace(/_/g, " ")}...`
                          }
                          className="h-8 text-sm"
                        />
                        {suggestions.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {suggestions.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => handleVariableChange(v, s)}
                                className="text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer rounded-md border px-1.5 py-0.5 text-[10px] transition-colors"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview */}
          {promptContent && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <EyeIcon className="text-muted-foreground h-4 w-4" />
                    <CardTitle className="text-sm">Preview</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                    className="h-7 text-xs"
                  >
                    {showPreview ? "Collapse" : "Expand"}
                  </Button>
                </div>
                {!showPreview && (
                  <CardDescription className="line-clamp-2 font-mono text-xs">
                    {previewContent.slice(0, 120)}...
                  </CardDescription>
                )}
              </CardHeader>
              {showPreview && (
                <CardContent>
                  <div className="bg-muted rounded-lg p-4">
                    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                      {previewContent.split(/(\{\{[^}]+\}\})/).map((part, i) =>
                        /^\{\{.+\}\}$/.test(part) ? (
                          <span
                            key={i}
                            className="rounded bg-yellow-200/50 px-1 font-semibold text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300"
                          >
                            {part}
                          </span>
                        ) : (
                          <span key={i}>{part}</span>
                        )
                      )}
                    </pre>
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Save dialog */}
      <Dialog
        open={saveOpen}
        onOpenChange={(open) => {
          if (!saving) setSaveOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as System Prompt</DialogTitle>
            <DialogDescription>
              Give this prompt a name. It will be saved to your organization
              library with type{" "}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">
                {selectedTemplate?.type ?? "system"}
              </code>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="save-name">Prompt name</Label>
            <Input
              id="save-name"
              autoFocus
              value={saveName}
              onChange={(e) => {
                setSaveName(e.target.value);
                if (saveError) setSaveError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) {
                  e.preventDefault();
                  handleConfirmSave();
                }
              }}
              placeholder="e.g. Code Review Assistant"
              aria-invalid={!!saveError}
            />
            {saveError && (
              <p className="text-destructive text-sm">{saveError}</p>
            )}
            <p className="text-muted-foreground text-xs">
              ~{tokenCount.toLocaleString()} tokens · {previewContent.length}{" "}
              characters
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmSave} disabled={saving}>
              {saving && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
              Save prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

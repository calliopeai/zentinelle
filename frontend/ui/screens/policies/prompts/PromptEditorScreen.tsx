import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageFrame,
  Section,
  StatusBadge,
  useUI,
} from "@calliopelabs/ui";
import { LockIcon, SearchXIcon } from "lucide-react";
import * as React from "react";

import type {
  AnalyzeSystemPromptResult,
  SystemPromptData,
} from "@/graphql/prompts/types";

import { Card } from "../../../shared/Card";
import { CodeBlock } from "../../../shared/CodeBlock";
import { Field } from "../../../shared/Field";
import { Select } from "../../../shared/Select";
import { Textarea } from "../../../shared/Textarea";
import { accessOf } from "../access";
import { areaCrumb } from "../frame";
import { PROMPT_TYPE_OPTIONS } from "../labels";
import {
  composeGuidedPrompt,
  promptVariables,
  type GuidedAnswers,
} from "../map";

export type PromptEditorMode = "blank" | "template" | "guided" | "edit";

export interface PromptDraft {
  name: string;
  promptType: string;
  description: string;
  promptText: string;
}

export interface PromptEditorScreenProps {
  capabilities: readonly string[];
  /** `/system-prompts/new?mode=` or `/system-prompts/{id}` (edit). */
  mode: PromptEditorMode;
  /** Edit: `GetSystemPrompt`. */
  prompt?: SystemPromptData | null;
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** Template mode: featured prompts (`GetSystemPrompts`, `featuredOnly`). */
  templates?: readonly SystemPromptData[];
  templatesLoading?: boolean;
  /** Template mode: the chosen template's text (`GetSystemPrompt`). */
  onPickTemplate?: (id: string) => Promise<SystemPromptData | null>;
  /** New: `CreateSystemPrompt`. Edit: `UpdateSystemPrompt`, in place. A rejection is the server's message. */
  onSave: (draft: PromptDraft) => Promise<unknown>;
  /** `AnalyzeSystemPrompt`. */
  onAnalyze: (
    promptText: string,
    promptType: string,
  ) => Promise<AnalyzeSystemPromptResult>;
  cancelHref: string;
}

const GUIDED: readonly {
  key: keyof GuidedAnswers;
  label: string;
  hint: string;
  rows: number;
}[] = [
  {
    key: "role",
    label: "Who the agent is",
    hint: "the Example Co support assistant",
    rows: 1,
  },
  {
    key: "audience",
    label: "Who it helps",
    hint: "customers with questions about their orders",
    rows: 1,
  },
  {
    key: "task",
    label: "What it does",
    hint: "Answers from the knowledge base and opens a ticket when it cannot.",
    rows: 2,
  },
  {
    key: "constraints",
    label: "Rules, one per line",
    hint: "Never promise a refund.",
    rows: 3,
  },
  {
    key: "format",
    label: "Answer format",
    hint: "at most three short paragraphs",
    rows: 1,
  },
];

function Analysis({ result }: { result: AnalyzeSystemPromptResult }) {
  if (!result.success)
    return (
      <p className="text-sm text-danger">
        {result.error ?? "The prompt could not be analyzed."}
      </p>
    );
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Score{" "}
        <span className="font-mono font-semibold">{result.overallScore}</span>{" "}
        of 100; token use {result.tokenEfficiency}.
      </p>
      {result.strengths.length > 0 && (
        <ul className="list-disc pl-5">
          {result.strengths.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {result.improvements.map((i, n) => (
        <div key={n} className="rounded-lg border border-border p-2">
          <p className="font-medium">{i.explanation}</p>
          {i.suggestedText && (
            <CodeBlock
              label="Suggested text"
              value={i.suggestedText}
              maxHeight="sm"
              className="mt-1"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** One prompt editor: started blank, from a template or guided, and the same form edits a prompt in place. */
export function PromptEditorScreen({
  capabilities,
  mode,
  prompt,
  loading,
  error,
  onRetry,
  templates = [],
  templatesLoading,
  onPickTemplate,
  onSave,
  onAnalyze,
  cancelHref,
}: PromptEditorScreenProps) {
  const { Link } = useUI();
  const { canEdit } = accessOf(capabilities);
  const editing = mode === "edit";
  // The route keys this screen by prompt id, so the form starts from the prompt once it has loaded.
  const [draft, setDraft] = React.useState<PromptDraft>({
    name: prompt?.name ?? "",
    promptType: prompt?.promptType ?? "system",
    description: prompt?.description ?? "",
    promptText: prompt?.promptText ?? "",
  });
  const [answers, setAnswers] = React.useState<GuidedAnswers>({
    role: "",
    audience: "",
    task: "",
    constraints: "",
    format: "",
  });
  const [template, setTemplate] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [textError, setTextError] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [analysis, setAnalysis] =
    React.useState<AnalyzeSystemPromptResult | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const title = editing ? (prompt?.name ?? "Prompt") : "New prompt";
  const crumbs = [areaCrumb(capabilities, "prompts", "/system-prompts")];

  if (editing && error) {
    return (
      <PageFrame crumbs={crumbs} title="Prompt">
        <ErrorState
          title="Could not load the prompt"
          error={error}
          onRetry={onRetry}
        />
      </PageFrame>
    );
  }
  if (editing && loading && !prompt) {
    return (
      <PageFrame crumbs={crumbs} title="Prompt">
        <LoadingState label="Loading the prompt" variant="page" />
      </PageFrame>
    );
  }
  if (editing && !prompt) {
    return (
      <PageFrame crumbs={crumbs} title="Prompt not found">
        <EmptyState
          icon={<SearchXIcon />}
          title="This prompt does not exist"
          description="It may have been deleted."
          actionHref="/system-prompts"
          actionLabel="Back to the library"
        />
      </PageFrame>
    );
  }
  if (!editing && !canEdit) {
    return (
      <PageFrame crumbs={crumbs} title={title}>
        <EmptyState
          icon={<LockIcon />}
          title="Your role can read prompts but not write them"
          description="An operator or administrator adds prompts to the library."
          actionHref={cancelHref}
          actionLabel="Back to the library"
        />
      </PageFrame>
    );
  }

  const text =
    mode === "guided" ? composeGuidedPrompt(answers) : draft.promptText;
  const variables = promptVariables(text);
  const readOnly = editing && !canEdit;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const n = draft.name.trim() ? null : "A name is required.";
    const t = text.trim() ? null : "The prompt has no text.";
    setNameError(n);
    setTextError(t);
    if (n || t) return;
    setFailure(null);
    setSaved(false);
    setSaving(true);
    try {
      await onSave({ ...draft, name: draft.name.trim(), promptText: text });
      setSaved(true);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const analyze = async () => {
    setAnalyzing(true);
    try {
      setAnalysis(await onAnalyze(text, draft.promptType));
    } catch (e) {
      setAnalysis({
        success: false,
        overallScore: 0,
        strengths: [],
        improvements: [],
        tokenEfficiency: "",
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const pick = async (id: string) => {
    setTemplate(id);
    if (!id || !onPickTemplate) return;
    const chosen = await onPickTemplate(id);
    if (chosen) {
      setDraft((d) => ({
        ...d,
        promptType: chosen.promptType ?? d.promptType,
        promptText: chosen.promptText ?? "",
        name: d.name || `${chosen.name ?? "Template"} (copy)`,
      }));
    }
  };

  return (
    <PageFrame
      crumbs={crumbs}
      title={<span className="[overflow-wrap:anywhere]">{title}</span>}
      status={
        editing && prompt ? (
          <StatusBadge tone="muted">v{prompt.version ?? 1}</StatusBadge>
        ) : undefined
      }
      context={
        editing
          ? (prompt?.promptTypeDisplay ?? undefined)
          : {
              blank: "Blank",
              template: "From a template",
              guided: "Guided",
              edit: "",
            }[mode]
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {readOnly ? (
          <Section
            title="Prompt text"
            description="Your role can read prompts but not change them."
          >
            <CodeBlock label="Prompt text" value={draft.promptText} />
          </Section>
        ) : (
          <form
            onSubmit={submit}
            noValidate
            className="flex min-w-0 flex-col gap-4"
          >
            {failure && (
              <p
                role="alert"
                className="rounded-lg border border-danger-border bg-danger-bg p-2 text-sm text-danger-fg"
              >
                {failure}
              </p>
            )}
            {saved && (
              <p role="status" className="text-sm text-success">
                Saved.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" error={nameError}>
                {(c) => (
                  <Input
                    {...c}
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                )}
              </Field>
              <Field label="Type">
                {(c) => (
                  <Select
                    {...c}
                    options={PROMPT_TYPE_OPTIONS}
                    value={draft.promptType}
                    onValueChange={(v) => setDraft({ ...draft, promptType: v })}
                  />
                )}
              </Field>
            </div>
            {!editing && (
              <Field
                label="Description"
                hint="What the prompt is for, for the next person who picks it."
              >
                {(c) => (
                  <Input
                    {...c}
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                )}
              </Field>
            )}
            {mode === "template" && (
              <Field
                label="Template"
                hint="Featured prompts in your library. The text is copied; the template is not changed."
              >
                {(c) => (
                  <Select
                    {...c}
                    disabled={templatesLoading}
                    options={[
                      {
                        value: "",
                        label: templatesLoading
                          ? "Loading templates"
                          : templates.length
                            ? "Choose a template"
                            : "No featured prompts yet",
                      },
                      ...templates.map((t) => ({
                        value: t.id,
                        label: t.name ?? t.id,
                      })),
                    ]}
                    value={template}
                    onValueChange={(v) => void pick(v)}
                  />
                )}
              </Field>
            )}
            {mode === "guided" ? (
              <>
                {GUIDED.map((q) => (
                  <Field
                    key={q.key}
                    label={q.label}
                    hint={`For example: ${q.hint}`}
                  >
                    {(c) =>
                      q.rows > 1 ? (
                        <Textarea
                          {...c}
                          rows={q.rows}
                          value={answers[q.key]}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.key]: e.target.value })
                          }
                        />
                      ) : (
                        <Input
                          {...c}
                          value={answers[q.key]}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.key]: e.target.value })
                          }
                        />
                      )
                    }
                  </Field>
                ))}
                <Section title="Draft" headingLevel="h3">
                  {text ? (
                    <CodeBlock
                      label="Draft prompt"
                      value={text}
                      maxHeight="sm"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Answer a question to start the draft.
                    </p>
                  )}
                  {textError && (
                    <p className="mt-1 text-xs text-danger">{textError}</p>
                  )}
                </Section>
              </>
            ) : (
              <Field
                label="Prompt text"
                hint="Use {{name}} for a value filled in at run time."
                error={textError}
              >
                {(c) => (
                  <Textarea
                    {...c}
                    mono
                    rows={12}
                    value={draft.promptText}
                    onChange={(e) =>
                      setDraft({ ...draft, promptText: e.target.value })
                    }
                  />
                )}
              </Field>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving
                  ? "Saving"
                  : editing
                    ? "Save changes"
                    : "Save to the library"}
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={cancelHref}>Cancel</Link>
              </Button>
            </div>
          </form>
        )}
        <aside
          className="flex min-w-0 flex-col gap-4"
          aria-label="Prompt checks"
        >
          <Card title="Variables">
            {variables.length ? (
              <ul className="flex flex-wrap gap-1">
                {variables.map((v) => (
                  <li key={v}>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs [overflow-wrap:anywhere]">
                      {v}
                    </code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                None. The prompt is the same for every run.
              </p>
            )}
          </Card>
          <Card
            title="Analysis"
            action={
              canEdit ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={analyzing || !text.trim()}
                  onClick={() => void analyze()}
                >
                  {analyzing ? "Analyzing" : "Analyze"}
                </Button>
              ) : undefined
            }
          >
            <div aria-live="polite">
              {analysis ? (
                <Analysis result={analysis} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {canEdit
                    ? "Checks clarity, safety and length. The text is sent to the configured model."
                    : "An operator or administrator can run the analysis."}
                </p>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </PageFrame>
  );
}

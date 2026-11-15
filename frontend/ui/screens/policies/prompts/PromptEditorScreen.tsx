import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageFrame,
  Panel,
  Section,
  Select,
  StatusBadge,
  Textarea,
  useUI,
} from "@calliopelabs/ui";
import { LockIcon, SearchXIcon } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";

import type {
  AnalyzeSystemPromptResult,
  SystemPromptData,
} from "@/graphql/prompts/types";

import { CodeBlock } from "../../../shared/CodeBlock";
import { accessOf } from "../access";
import { areaCrumb } from "../frame";
import { usePolicyLabels } from "../labels";
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

const guided = (
  t: (key: string) => string,
): readonly {
  key: keyof GuidedAnswers;
  label: string;
  hint: string;
  rows: number;
}[] => [
  {
    key: "role",
    label: t("whoTheAgentIs"),
    hint: t("theExampleCoSupportAssistant"),
    rows: 1,
  },
  {
    key: "audience",
    label: t("whoItHelps"),
    hint: t("customersWithQuestionsAboutTheir"),
    rows: 1,
  },
  {
    key: "task",
    label: t("whatItDoes"),
    hint: t("answersFromTheKnowledgeBase"),
    rows: 2,
  },
  {
    key: "constraints",
    label: t("rulesOnePerLine"),
    hint: t("neverPromiseARefund"),
    rows: 3,
  },
  {
    key: "format",
    label: t("answerFormat"),
    hint: t("atMostThreeShortParagraphs"),
    rows: 1,
  },
];

function Analysis({ result }: { result: AnalyzeSystemPromptResult }) {
  const t = useTranslations("policies.promptEditorScreen");
  if (!result.success)
    return (
      <p className="text-sm text-danger">
        {result.error ?? t("thePromptCouldNotBe")}
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
              label={t("suggestedText")}
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
  const t = useTranslations("policies.promptEditorScreen");
  const { PROMPT_TYPE_OPTIONS } = usePolicyLabels();
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

  const title = editing ? (prompt?.name ?? t("prompt")) : t("newPrompt");
  const crumbs = [areaCrumb(capabilities, "prompts", "/system-prompts")];

  if (editing && error) {
    return (
      <PageFrame crumbs={crumbs} title={t("prompt")}>
        <ErrorState
          title={t("couldNotLoadThePrompt")}
          error={error}
          onRetry={onRetry}
        />
      </PageFrame>
    );
  }
  if (editing && loading && !prompt) {
    return (
      <PageFrame crumbs={crumbs} title={t("prompt")}>
        <LoadingState label={t("loadingThePrompt")} variant="page" />
      </PageFrame>
    );
  }
  if (editing && !prompt) {
    return (
      <PageFrame crumbs={crumbs} title={t("promptNotFound")}>
        <EmptyState
          icon={<SearchXIcon />}
          title={t("thisPromptDoesNotExist")}
          description={t("itMayHaveBeenDeleted")}
          actionHref="/system-prompts"
          actionLabel={t("backToTheLibrary")}
        />
      </PageFrame>
    );
  }
  if (!editing && !canEdit) {
    return (
      <PageFrame crumbs={crumbs} title={title}>
        <EmptyState
          icon={<LockIcon />}
          title={t("yourRoleCanReadPrompts")}
          description={t("anOperatorOrAdministratorAdds")}
          actionHref={cancelHref}
          actionLabel={t("backToTheLibrary")}
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
    const n = draft.name.trim() ? null : t("aNameIsRequired");
    const missing = text.trim() ? null : t("thePromptHasNoText");
    setNameError(n);
    setTextError(missing);
    if (n || missing) return;
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
        name: d.name || t("copyName", { name: chosen.name ?? t("template") }),
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
              blank: t("blank"),
              template: t("fromATemplate"),
              guided: t("guided"),
              edit: "",
            }[mode]
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {readOnly ? (
          <Section
            title={t("promptText")}
            description={t("yourRoleCanReadPrompts2")}
          >
            <CodeBlock label={t("promptText")} value={draft.promptText} />
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
                {t("saved")}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("name")} error={nameError}>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label={t("type")}>
                <Select
                  className="w-full"
                  options={PROMPT_TYPE_OPTIONS}
                  value={draft.promptType}
                  onValueChange={(v) => setDraft({ ...draft, promptType: v })}
                />
              </Field>
            </div>
            {!editing && (
              <Field label={t("description")} hint={t("whatThePromptIsFor")}>
                <Input
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </Field>
            )}
            {mode === "template" && (
              <Field
                label={t("template")}
                hint={t("featuredPromptsInYourLibrary")}
              >
                <Select
                  className="w-full"
                  disabled={templatesLoading}
                  placeholder={
                    templatesLoading
                      ? t("loadingTemplates")
                      : templates.length
                        ? t("chooseATemplate")
                        : t("noFeaturedPromptsYet")
                  }
                  options={templates.map((t) => ({
                    value: t.id,
                    label: t.name ?? t.id,
                  }))}
                  value={template}
                  onValueChange={(v) => void pick(v)}
                />
              </Field>
            )}
            {mode === "guided" ? (
              <>
                {guided(t).map((q) => (
                  <Field
                    key={q.key}
                    label={q.label}
                    hint={t("forExample", { hint: q.hint })}
                  >
                    {q.rows > 1 ? (
                      <Textarea
                        className="min-h-24 py-2"
                        rows={q.rows}
                        value={answers[q.key]}
                        onChange={(e) =>
                          setAnswers({ ...answers, [q.key]: e.target.value })
                        }
                      />
                    ) : (
                      <Input
                        value={answers[q.key]}
                        onChange={(e) =>
                          setAnswers({ ...answers, [q.key]: e.target.value })
                        }
                      />
                    )}
                  </Field>
                ))}
                <Section title={t("draft")} headingLevel="h3">
                  {text ? (
                    <CodeBlock
                      label={t("draftPrompt")}
                      value={text}
                      maxHeight="sm"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("answerAQuestionToStart")}
                    </p>
                  )}
                  {textError && (
                    <p className="mt-1 text-xs text-danger">{textError}</p>
                  )}
                </Section>
              </>
            ) : (
              <Field
                label={t("promptText")}
                hint={t("variableHint")}
                error={textError}
              >
                <Textarea
                  className="min-h-24 py-2 font-mono text-xs md:text-xs"
                  rows={12}
                  value={draft.promptText}
                  onChange={(e) =>
                    setDraft({ ...draft, promptText: e.target.value })
                  }
                />
              </Field>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving
                  ? t("saving")
                  : editing
                    ? t("saveChanges")
                    : t("saveToTheLibrary")}
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={cancelHref}>{t("cancel")}</Link>
              </Button>
            </div>
          </form>
        )}
        <aside
          className="flex min-w-0 flex-col gap-4"
          aria-label={t("promptChecks")}
        >
          <Panel title={t("variables")}>
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
                {t("noneThePromptIsThe")}
              </p>
            )}
          </Panel>
          <Panel
            title={t("analysis")}
            actions={
              canEdit ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={analyzing || !text.trim()}
                  onClick={() => void analyze()}
                >
                  {analyzing ? t("analyzing") : t("analyze")}
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
                    ? t("checksClaritySafetyAndLength")
                    : t("anOperatorOrAdministratorCan")}
                </p>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </PageFrame>
  );
}

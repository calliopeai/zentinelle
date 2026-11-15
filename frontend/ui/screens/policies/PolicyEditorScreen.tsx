import {
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageFrame,
  Section,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useUI,
} from "@calliopelabs/ui";
import { LockIcon } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";

import type {
  CreatePolicyInput,
  PolicyData,
  PolicyOptions,
} from "@/graphql/policies/types";

import { Card } from "./components/Card";
import { DefinitionList } from "./components/DefinitionList";
import { Field } from "../../shared/Field";
import { Select } from "../../shared/Select";
import { Textarea } from "../../shared/Textarea";
import { accessOf } from "./access";
import { areaCrumb } from "./frame";
import { usePolicyLabels } from "./labels";
import { PolicyConfigFields } from "./PolicyConfigFields";

export type PolicySource = "blank" | "document";

export interface PolicyEditorScreenProps {
  capabilities: readonly string[];
  /** `GetPolicyOptions`: types with their config schema, scopes, enforcement levels. */
  options: PolicyOptions | null;
  optionsLoading: boolean;
  optionsError?: { message: string } | null;
  onRetry: () => void;
  /** Absent: New policy (`CreatePolicy`). Present: edit in place (`UpdatePolicy`). */
  policy?: PolicyData | null;
  /** Agents for an agent-scoped policy (`GetEndpoints`). */
  agents?: readonly { id: string; name: string }[];
  /** `?source=document`: start from a pasted policy document. */
  source: PolicySource;
  onSourceChange: (source: PolicySource) => void;
  /** Turns a document into a draft the form opens with; null when nothing could be read. */
  onDraftFromDocument: (
    text: string,
  ) => Promise<Partial<CreatePolicyInput> | null>;
  /** CreatePolicy or UpdatePolicy. A rejection is the server's message, shown above the form. */
  onSubmit: (input: CreatePolicyInput) => Promise<unknown>;
  cancelHref: string;
}

function initialForm(
  policy: PolicyData | null | undefined,
  options: PolicyOptions | null,
): CreatePolicyInput {
  return {
    name: policy?.name ?? "",
    description: policy?.description ?? "",
    policyType: policy?.policyType ?? options?.policyTypes[0]?.value ?? "",
    scopeType: policy?.scopeType ?? "organization",
    scopeEndpointId: null,
    config: policy?.config ?? {},
    priority: policy?.priority ?? 100,
    enforcement: policy?.enforcement ?? "enforce",
    action: policy?.action ?? "block",
    blockLevel: policy?.blockLevel ?? "turn",
    steerMessage: policy?.steerMessage ?? "",
    enabled: policy?.enabled ?? true,
  };
}

/**
 * New policy and Edit policy, one form. The type decides the configuration
 * fields (`configSchema`); the mode is the ceiling on the action (#396).
 * Type and scope are fixed once a policy exists: `UpdatePolicy` takes neither.
 */
export function PolicyEditorScreen({
  capabilities,
  options,
  optionsLoading,
  optionsError,
  onRetry,
  policy,
  agents = [],
  source,
  onSourceChange,
  onDraftFromDocument,
  onSubmit,
  cancelHref,
}: PolicyEditorScreenProps) {
  const t = useTranslations("policies.policyEditorScreen");
  const { ACTION_OPTIONS, BLOCK_LEVEL_OPTIONS, scopeLabel, typeLabel } =
    usePolicyLabels();
  const { Link } = useUI();
  const { canEdit } = accessOf(capabilities);
  const editing = Boolean(policy);
  const [form, setForm] = React.useState<CreatePolicyInput>(() =>
    initialForm(policy, options),
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [doc, setDoc] = React.useState("");
  const [drafting, setDrafting] = React.useState(false);
  const [docNote, setDocNote] = React.useState<string | null>(null);
  const [formKey, setFormKey] = React.useState(0);

  const title = editing ? `Edit ${policy?.name}` : t("newPolicy");
  const crumbs = [
    areaCrumb(capabilities, "policies", "/policies"),
    ...(editing && policy
      ? [
          {
            label: policy.name,
            href: `/policies/${encodeURIComponent(policy.id)}`,
          },
        ]
      : []),
  ];

  if (!canEdit) {
    return (
      <PageFrame crumbs={crumbs} title={title}>
        <EmptyState
          icon={<LockIcon />}
          title={t("yourRoleCanReadPolicies")}
          description={t("anOperatorOrAdministratorCreates")}
          actionHref={cancelHref}
          actionLabel={t("backToPolicies")}
        />
      </PageFrame>
    );
  }
  if (optionsError) {
    return (
      <PageFrame crumbs={crumbs} title={title}>
        <ErrorState
          title={t("couldNotLoadThePolicy")}
          error={optionsError}
          onRetry={onRetry}
        />
      </PageFrame>
    );
  }
  if (optionsLoading || !options) {
    return (
      <PageFrame crumbs={crumbs} title={title}>
        <LoadingState label={t("loadingThePolicyTypes")} variant="page" />
      </PageFrame>
    );
  }

  // The form opens before the options arrive; the first type is the default once they do.
  const policyType = form.policyType || options.policyTypes[0]?.value || "";
  const typeOption = options.policyTypes.find((t) => t.value === policyType);
  const set = <K extends keyof CreatePolicyInput>(
    key: K,
    value: CreatePolicyInput[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "A name is required.";
    if (!policyType) next.policyType = t("choosePolicyType");
    if (form.scopeType === "endpoint" && !form.scopeEndpointId && !editing)
      next.scopeEndpointId = t("chooseAgent");
    if (form.action === "steer" && !form.steerMessage?.trim())
      next.steerMessage = "A steer needs the message it sends the agent.";
    if (!Number.isInteger(form.priority)) next.priority = t("wholeNumber");
    setErrors(next);
    if (Object.keys(next).length) return;
    setFailure(null);
    setSaving(true);
    try {
      await onSubmit({ ...form, policyType, name: form.name.trim() });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const draft = async () => {
    setDrafting(true);
    setDocNote(null);
    try {
      const result = await onDraftFromDocument(doc);
      if (!result) {
        setDocNote(t("nothingInTheDocumentReads"));
        return;
      }
      setForm((f) => ({ ...f, ...result }));
      setFormKey((k) => k + 1);
      onSourceChange("blank");
    } catch (e) {
      setDocNote(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting(false);
    }
  };

  const enforcementOptions = options.enforcementLevels
    .filter((l) => l.value)
    .map((l) => ({ value: l.value!, label: l.label ?? l.value! }));
  const enforcementHint = options.enforcementLevels.find(
    (l) => l.value === form.enforcement,
  )?.description;

  const formBody = (
    <form
      key={formKey}
      onSubmit={submit}
      noValidate
      className="flex max-w-3xl flex-col gap-6"
    >
      {failure && (
        <p
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-bg p-2 text-sm text-danger-fg"
        >
          {failure}
        </p>
      )}
      <Section title={t("whatItIs")}>
        <div className="grid gap-4 sm:grid-cols-2">
          {editing ? (
            <DefinitionList
              className="sm:col-span-2"
              items={[
                { term: t("type"), description: typeLabel(policyType) },
                {
                  term: t("scope"),
                  description: `${scopeLabel(form.scopeType ?? "")}${policy?.scopeName ? `: ${policy.scopeName}` : ""}`,
                },
              ]}
            />
          ) : (
            <>
              <Field
                label={t("type")}
                hint={typeOption?.description ?? undefined}
                error={errors.policyType}
              >
                {(c) => (
                  <Select
                    {...c}
                    options={[...options.policyTypes]
                      .filter((t) => t.value)
                      .sort(
                        (a, b) =>
                          (a.category ?? "").localeCompare(b.category ?? "") ||
                          (a.label ?? "").localeCompare(b.label ?? ""),
                      )
                      .map((t) => ({
                        value: t.value!,
                        label: `${t.category ? `${t.category}: ` : ""}${typeLabel(t.value!)}`,
                      }))}
                    value={policyType}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, policyType: v, config: {} }))
                    }
                  />
                )}
              </Field>
              <Field label={t("appliesTo")}>
                {(c) => (
                  <Select
                    {...c}
                    options={options.scopeTypes
                      .filter((s) => s.value)
                      .map((s) => ({
                        value: s.value!,
                        label: scopeLabel(s.value!),
                      }))}
                    value={form.scopeType ?? "organization"}
                    onValueChange={(v) => set("scopeType", v)}
                  />
                )}
              </Field>
              {form.scopeType === "endpoint" && (
                <Field label={t("agent")} error={errors.scopeEndpointId}>
                  {(c) => (
                    <Select
                      {...c}
                      options={[
                        { value: "", label: t("chooseAnAgent") },
                        ...agents.map((a) => ({ value: a.id, label: a.name })),
                      ]}
                      value={form.scopeEndpointId ?? ""}
                      onValueChange={(v) => set("scopeEndpointId", v || null)}
                    />
                  )}
                </Field>
              )}
            </>
          )}
          <Field
            label={t("name")}
            error={errors.name}
            className="sm:col-span-2"
          >
            {(c) => (
              <Input
                {...c}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t("description")}
            hint={t("whyThePolicyExistsReviewers")}
            className="sm:col-span-2"
          >
            {(c) => (
              <Textarea
                {...c}
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
              />
            )}
          </Field>
        </div>
      </Section>
      <Section
        title={t("configuration")}
        description={typeOption ? typeLabel(policyType) : undefined}
      >
        <Card>
          <PolicyConfigFields
            key={policyType}
            schema={typeOption?.configSchema}
            value={(form.config as Record<string, unknown>) ?? {}}
            onChange={(v) => set("config", v)}
          />
        </Card>
      </Section>
      <Section title={t("whenItMatches")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("mode")} hint={enforcementHint ?? undefined}>
            {(c) => (
              <Select
                {...c}
                options={enforcementOptions}
                value={form.enforcement ?? "enforce"}
                onValueChange={(v) => set("enforcement", v)}
              />
            )}
          </Field>
          <Field label={t("action")}>
            {(c) => (
              <Select
                {...c}
                options={ACTION_OPTIONS}
                value={form.action ?? "block"}
                onValueChange={(v) => set("action", v)}
              />
            )}
          </Field>
          {form.action === "block" && (
            <Field label={t("whatABlockStops")}>
              {(c) => (
                <Select
                  {...c}
                  options={BLOCK_LEVEL_OPTIONS}
                  value={form.blockLevel ?? "turn"}
                  onValueChange={(v) => set("blockLevel", v)}
                />
              )}
            </Field>
          )}
          {form.action === "steer" && (
            <Field
              label={t("steerMessage")}
              hint={t("injectedIntoTheConversationTo")}
              error={errors.steerMessage}
              className="sm:col-span-2"
            >
              {(c) => (
                <Textarea
                  {...c}
                  rows={2}
                  value={form.steerMessage ?? ""}
                  onChange={(e) => set("steerMessage", e.target.value)}
                />
              )}
            </Field>
          )}
          <Field
            label={t("priority")}
            hint={t("higherWinsWithinATier")}
            error={errors.priority}
          >
            {(c) => (
              <Input
                {...c}
                inputMode="numeric"
                value={String(form.priority ?? "")}
                onChange={(e) =>
                  set(
                    "priority",
                    e.target.value === "" ? Number.NaN : Number(e.target.value),
                  )
                }
              />
            )}
          </Field>
          <div className="flex items-center gap-2 self-end pb-1.5">
            <Checkbox
              id="policy-enabled"
              checked={form.enabled ?? true}
              onCheckedChange={(v) => set("enabled", v === true)}
            />
            <label htmlFor="policy-enabled" className="text-sm">
              {t("on")}
            </label>
          </div>
        </div>
      </Section>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving
            ? t("saving")
            : editing
              ? t("saveChanges")
              : t("createPolicy")}
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={cancelHref}>{t("cancel")}</Link>
        </Button>
      </div>
    </form>
  );

  return (
    <PageFrame crumbs={crumbs} title={title}>
      {editing ? (
        formBody
      ) : (
        <Tabs
          value={source}
          onValueChange={(v) => onSourceChange(v as PolicySource)}
        >
          <TabsList aria-label={t("startFrom")}>
            <TabsTrigger value="blank">{t("blank")}</TabsTrigger>
            <TabsTrigger value="document">{t("fromADocument")}</TabsTrigger>
          </TabsList>
          <TabsContent value="blank" className="pt-4">
            {formBody}
          </TabsContent>
          <TabsContent value="document" className="flex flex-col gap-3 pt-4">
            <Field
              label={t("policyDocument")}
              hint={t("pasteThePolicyAsWritten")}
            >
              {(c) => (
                <Textarea
                  {...c}
                  rows={10}
                  value={doc}
                  onChange={(e) => setDoc(e.target.value)}
                />
              )}
            </Field>
            {docNote && (
              <p role="status" className="text-sm text-muted-foreground">
                {docNote}
              </p>
            )}
            <Button
              size="sm"
              className="self-start"
              disabled={drafting || !doc.trim()}
              onClick={() => void draft()}
            >
              {drafting ? t("readingTheDocument") : t("draftThePolicy")}
            </Button>
          </TabsContent>
        </Tabs>
      )}
    </PageFrame>
  );
}

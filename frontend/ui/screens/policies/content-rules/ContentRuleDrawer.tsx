import {
  Button,
  Checkbox,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Field,
  Input,
  Select,
  Textarea,
} from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import type {
  ContentRuleData,
  CreateContentRuleInput,
} from "@/graphql/content-rules/types";

import { ANY } from "../../../shared/select-any";
import { CodeBlock } from "../../../shared/CodeBlock";
import { DefinitionList } from "../components/DefinitionList";
import { usePolicyLabels } from "../labels";

export interface ContentRuleDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rule to edit; null for a new one. */
  rule: ContentRuleData | null;
  /** False for a viewer: the drawer shows the rule and saves nothing. */
  canEdit: boolean;
  /** `CreateContentRule` or `UpdateContentRule`. A rejection is the server's message. */
  onSubmit: (input: CreateContentRuleInput) => Promise<unknown>;
}

function toInput(rule: ContentRuleData | null): CreateContentRuleInput {
  return {
    name: rule?.name ?? "",
    description: rule?.description ?? "",
    ruleType: rule?.ruleType ?? "secret_detection",
    severity: rule?.severity ?? "high",
    action: rule?.action ?? "block",
    scanMode: rule?.scanMode ?? "realtime",
    scanInput: rule?.scanInput ?? true,
    scanOutput: rule?.scanOutput ?? true,
    scanContext: rule?.scanContext ?? false,
    enabled: rule?.enabled ?? true,
    notifyAdmins: rule?.notifyAdmins ?? true,
    notifyUser: rule?.notifyUser ?? false,
    config: rule?.config ?? {},
  };
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}

function RuleBody({
  onOpenChange,
  rule,
  canEdit,
  onSubmit,
}: Omit<ContentRuleDrawerProps, "open">) {
  const t = useTranslations("policies.contentRuleDrawer");
  const {
    RULE_ACTION_OPTIONS,
    RULE_TYPE_OPTIONS,
    SCAN_MODE_OPTIONS,
    SEVERITY_OPTIONS,
    formatDateTime,
  } = usePolicyLabels();
  const [form, setForm] = React.useState(() => toInput(rule));
  const [config, setConfig] = React.useState(() =>
    JSON.stringify(rule?.config ?? {}, null, 2),
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof CreateContentRuleInput>(
    k: K,
    v: CreateContentRuleInput[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "A name is required.";
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(config || "{}");
    } catch {
      next.config = t("configNotJson");
    }
    if (!form.scanInput && !form.scanOutput && !form.scanContext)
      next.scan = t("scanOne");
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setFailure(null);
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        config: parsed as Record<string, unknown>,
      });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const title = rule ? rule.name : t("newContentRule");
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="[overflow-wrap:anywhere]">{title}</DrawerTitle>
        <DrawerDescription>
          {rule
            ? `Updated ${formatDateTime(rule.updatedAt)}`
            : t("whatTheScannerLooksFor")}
        </DrawerDescription>
      </DrawerHeader>
      {!canEdit && rule ? (
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
          <DefinitionList
            layout="stacked"
            items={[
              {
                term: t("type"),
                description: rule.ruleTypeDisplay ?? rule.ruleType,
              },
              {
                term: t("severity"),
                description: rule.severityDisplay ?? rule.severity,
              },
              {
                term: t("onMatch"),
                description: rule.actionDisplay ?? rule.action,
              },
              {
                term: t("description"),
                description: rule.description || t("none"),
              },
            ]}
          />
          <CodeBlock
            label={t("ruleConfiguration")}
            value={rule.config ?? {}}
            maxHeight="sm"
          />
          <p className="text-sm text-muted-foreground">
            {t("yourRoleCanReadContent")}
          </p>
        </div>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
            {failure && (
              <p
                role="alert"
                className="rounded-lg border border-danger-border bg-danger-bg p-2 text-sm text-danger-fg"
              >
                {failure}
              </p>
            )}
            <Field label={t("name")} error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label={t("description")}>
              <Textarea
                className="min-h-24 py-2"
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("type")}>
                <Select
                  className="w-full"
                  options={RULE_TYPE_OPTIONS}
                  value={form.ruleType}
                  onValueChange={(v) => set("ruleType", v)}
                />
              </Field>
              <Field label={t("severity")}>
                <Select
                  className="w-full"
                  options={SEVERITY_OPTIONS.filter((o) => o.value !== ANY)}
                  value={form.severity ?? "high"}
                  onValueChange={(v) => set("severity", v)}
                />
              </Field>
              <Field label={t("onMatch")}>
                <Select
                  className="w-full"
                  options={RULE_ACTION_OPTIONS}
                  value={form.action ?? "block"}
                  onValueChange={(v) => set("action", v)}
                />
              </Field>
              <Field label={t("when")}>
                <Select
                  className="w-full"
                  options={SCAN_MODE_OPTIONS}
                  value={form.scanMode ?? "realtime"}
                  onValueChange={(v) => set("scanMode", v)}
                />
              </Field>
            </div>
            <fieldset
              className="flex flex-col gap-2"
              aria-describedby={errors.scan ? "scan-error" : undefined}
            >
              <legend className="mb-1 text-sm font-medium">Scan</legend>
              <Toggle
                label={t("prompts")}
                checked={form.scanInput ?? false}
                onChange={(v) => set("scanInput", v)}
              />
              <Toggle
                label={t("answers")}
                checked={form.scanOutput ?? false}
                onChange={(v) => set("scanOutput", v)}
              />
              <Toggle
                label={t("conversationContext")}
                checked={form.scanContext ?? false}
                onChange={(v) => set("scanContext", v)}
              />
              {errors.scan && (
                <p id="scan-error" className="text-xs text-danger">
                  {errors.scan}
                </p>
              )}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Notify</legend>
              <Toggle
                label={t("administrators")}
                checked={form.notifyAdmins ?? false}
                onChange={(v) => set("notifyAdmins", v)}
              />
              <Toggle
                label={t("thePersonWhoSentIt")}
                checked={form.notifyUser ?? false}
                onChange={(v) => set("notifyUser", v)}
              />
            </fieldset>
            <Field
              label={t("configuration")}
              hint={t("jsonPatternsKeywordsOrThresholds")}
              error={errors.config}
            >
              <Textarea
                className="min-h-24 py-2 font-mono text-xs md:text-xs"
                rows={5}
                value={config}
                onChange={(e) => setConfig(e.target.value)}
              />
            </Field>
            <Toggle
              label={t("on")}
              checked={form.enabled ?? true}
              onChange={(v) => set("enabled", v)}
            />
          </div>
          <DrawerFooter className="flex-row justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? t("saving") : rule ? t("saveRule") : t("createRule")}
            </Button>
          </DrawerFooter>
        </form>
      )}
    </>
  );
}

/** A content rule, new or existing, in a drawer beside the list. Read-only for a viewer. Each opening starts from the rule as saved. */
export function ContentRuleDrawer({ open, ...props }: ContentRuleDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={props.onOpenChange}>
      <DrawerContent className="sm:max-w-lg">
        <RuleBody key={props.rule?.id ?? "new"} {...props} />
      </DrawerContent>
    </Drawer>
  );
}

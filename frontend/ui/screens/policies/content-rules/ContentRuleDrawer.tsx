import {
  Button,
  Checkbox,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Input,
} from "@calliopelabs/ui";
import * as React from "react";

import type {
  ContentRuleData,
  CreateContentRuleInput,
} from "@/graphql/content-rules/types";

import { CodeBlock } from "../../../shared/CodeBlock";
import { DefinitionList } from "../../../shared/DefinitionList";
import { Field } from "../../../shared/Field";
import { Select } from "../../../shared/Select";
import { Textarea } from "../../../shared/Textarea";
import {
  RULE_ACTION_OPTIONS,
  RULE_TYPE_OPTIONS,
  SCAN_MODE_OPTIONS,
  SEVERITY_OPTIONS,
  formatDateTime,
} from "../labels";

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
      next.config = "The configuration is not valid JSON.";
    }
    if (!form.scanInput && !form.scanOutput && !form.scanContext)
      next.scan = "Scan at least one of prompts, answers or context.";
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

  const title = rule ? rule.name : "New content rule";
  return (
    <>
      <DrawerHeader>
        <DrawerTitle className="[overflow-wrap:anywhere]">{title}</DrawerTitle>
        <DrawerDescription>
          {rule
            ? `Updated ${formatDateTime(rule.updatedAt)}`
            : "What the scanner looks for, where, and what it does on a match."}
        </DrawerDescription>
      </DrawerHeader>
      {!canEdit && rule ? (
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
          <DefinitionList
            layout="stacked"
            items={[
              {
                term: "Type",
                description: rule.ruleTypeDisplay ?? rule.ruleType,
              },
              {
                term: "Severity",
                description: rule.severityDisplay ?? rule.severity,
              },
              {
                term: "On match",
                description: rule.actionDisplay ?? rule.action,
              },
              {
                term: "Description",
                description: rule.description || "None",
              },
            ]}
          />
          <CodeBlock
            label="Rule configuration"
            value={rule.config ?? {}}
            maxHeight="sm"
          />
          <p className="text-sm text-muted-foreground">
            Your role can read content rules but not change them.
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
            <Field label="Name" error={errors.name}>
              {(c) => (
                <Input
                  {...c}
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              )}
            </Field>
            <Field label="Description">
              {(c) => (
                <Textarea
                  {...c}
                  rows={2}
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                {(c) => (
                  <Select
                    {...c}
                    options={RULE_TYPE_OPTIONS}
                    value={form.ruleType}
                    onValueChange={(v) => set("ruleType", v)}
                  />
                )}
              </Field>
              <Field label="Severity">
                {(c) => (
                  <Select
                    {...c}
                    options={SEVERITY_OPTIONS.filter((o) => o.value)}
                    value={form.severity ?? "high"}
                    onValueChange={(v) => set("severity", v)}
                  />
                )}
              </Field>
              <Field label="On match">
                {(c) => (
                  <Select
                    {...c}
                    options={RULE_ACTION_OPTIONS}
                    value={form.action ?? "block"}
                    onValueChange={(v) => set("action", v)}
                  />
                )}
              </Field>
              <Field label="When">
                {(c) => (
                  <Select
                    {...c}
                    options={SCAN_MODE_OPTIONS}
                    value={form.scanMode ?? "realtime"}
                    onValueChange={(v) => set("scanMode", v)}
                  />
                )}
              </Field>
            </div>
            <fieldset
              className="flex flex-col gap-2"
              aria-describedby={errors.scan ? "scan-error" : undefined}
            >
              <legend className="mb-1 text-sm font-medium">Scan</legend>
              <Toggle
                label="Prompts"
                checked={form.scanInput ?? false}
                onChange={(v) => set("scanInput", v)}
              />
              <Toggle
                label="Answers"
                checked={form.scanOutput ?? false}
                onChange={(v) => set("scanOutput", v)}
              />
              <Toggle
                label="Conversation context"
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
                label="Administrators"
                checked={form.notifyAdmins ?? false}
                onChange={(v) => set("notifyAdmins", v)}
              />
              <Toggle
                label="The person who sent it"
                checked={form.notifyUser ?? false}
                onChange={(v) => set("notifyUser", v)}
              />
            </fieldset>
            <Field
              label="Configuration"
              hint="JSON: patterns, keywords or thresholds, by type."
              error={errors.config}
            >
              {(c) => (
                <Textarea
                  {...c}
                  mono
                  rows={5}
                  value={config}
                  onChange={(e) => setConfig(e.target.value)}
                />
              )}
            </Field>
            <Toggle
              label="On"
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
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving" : rule ? "Save rule" : "Create rule"}
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

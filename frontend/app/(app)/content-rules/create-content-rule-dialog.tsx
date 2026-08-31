"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import {
  CREATE_CONTENT_RULE,
  TEST_CONTENT_RULE,
  UPDATE_CONTENT_RULE,
} from "@/graphql/content-rules/mutations";
import type {
  ContentRuleData,
  CreateContentRulePayload,
  TestContentRulePayload,
  UpdateContentRulePayload,
} from "@/graphql/content-rules/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RULE_TYPES = [
  { value: "secret_detection", label: "Secret/Credential Detection" },
  { value: "pii_detection", label: "PII Detection" },
  { value: "phi_detection", label: "PHI Detection" },
  { value: "profanity_filter", label: "Profanity Filter" },
  { value: "custom_pattern", label: "Custom Pattern (Regex)" },
  { value: "keyword_block", label: "Keyword Blocklist" },
  { value: "prompt_injection", label: "Prompt Injection Detection" },
  { value: "jailbreak_attempt", label: "Jailbreak Attempt Detection" },
  { value: "off_topic", label: "Off-Topic/Personal Use Detection" },
  { value: "policy_violation", label: "Policy Violation" },
  { value: "cost_threshold", label: "Cost Threshold Alert" },
  { value: "rate_anomaly", label: "Usage Rate Anomaly" },
  { value: "token_limit", label: "Token Limit Exceeded" },
];

const SEVERITY_OPTIONS = [
  { value: "info", label: "Info" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const ENFORCEMENT_OPTIONS = [
  { value: "block", label: "Block" },
  { value: "warn", label: "Warn" },
  { value: "log_only", label: "Log Only" },
  { value: "redact", label: "Redact" },
  { value: "require_approval", label: "Require Approval" },
];

const SCAN_MODE_OPTIONS = [
  { value: "input", label: "Input only — what the agent sends" },
  { value: "output", label: "Output only — what the model returns" },
  { value: "both", label: "Both directions" },
];

const SCOPE_OPTIONS = [
  { value: "organization", label: "Organization — everything in this tenant" },
  { value: "deployment", label: "Deployment" },
  { value: "endpoint", label: "A single agent" },
];

const contentRuleSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  description: z.string().optional(),
  ruleType: z.string().min(1, "Rule type is required"),
  severity: z.string(),
  enforcement: z.string(),
  config: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === "") return true;
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Config must be valid JSON" },
    ),
  scanMode: z.string(),
  scopeType: z.string(),
  // A plain number, with the conversion done by `valueAsNumber` on the input
  // below. z.coerce would do it too, but it widens the schema's *input* type
  // to unknown, and the resolver then no longer matches the form's value type
  // — which tsc lets through and the Next build does not.
  //
  // Lower runs first: a redact rule at 10 rewrites the text before a block
  // rule at 20 decides on it, and that ordering is why the field is editable.
  priority: z.number().int().min(0).max(1000),
  enabled: z.boolean(),
});

type ContentRuleFormValues = z.infer<typeof contentRuleSchema>;

type CreateContentRuleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editRule?: ContentRuleData | null;
};

export function CreateContentRuleDialog({
  open,
  onOpenChange,
  onSaved,
  editRule,
}: CreateContentRuleDialogProps) {
  const isEdit = !!editRule;

  const [createRule, { loading: creating }] = useMutation<{
    createContentRule: CreateContentRulePayload;
  }>(CREATE_CONTENT_RULE);
  const [updateRule, { loading: updating }] = useMutation<{
    updateContentRule: UpdateContentRulePayload;
  }>(UPDATE_CONTENT_RULE);
  const submitting = creating || updating;

  // Trying a rule against a sample before trusting it. The mutation takes a
  // saved rule's id, so this is offered on edit only; a new rule has nothing
  // to test against yet, and the panel says so rather than appearing broken.
  const [sample, setSample] = useState("");
  const [testResult, setTestResult] = useState<TestContentRulePayload | null>(
    null,
  );
  const [testRule, { loading: testing }] = useMutation<{
    testContentRule: TestContentRulePayload;
  }>(TEST_CONTENT_RULE);

  const runTest = async () => {
    if (!editRule || !sample.trim()) return;
    setTestResult(null);
    try {
      const { data } = await testRule({
        variables: { id: editRule.id, content: sample },
      });
      setTestResult(data?.testContentRule ?? null);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not test the rule");
    }
  };

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ContentRuleFormValues>({
    resolver: zodResolver(contentRuleSchema),
    defaultValues: {
      name: "",
      description: "",
      ruleType: "",
      severity: "medium",
      enforcement: "log_only",
      config: "",
      enabled: true,
    },
  });

  useEffect(() => {
    if (open) {
      setSample("");
      setTestResult(null);
      if (editRule) {
        reset({
          name: editRule.name,
          description: editRule.description || "",
          ruleType: editRule.ruleType,
          severity: editRule.severity,
          enforcement: editRule.enforcement,
          config: editRule.config
            ? JSON.stringify(editRule.config, null, 2)
            : "",
          scanMode: editRule.scanMode || "both",
          scopeType: editRule.scopeType || "organization",
          priority: editRule.priority ?? 100,
          enabled: editRule.enabled,
        });
      } else {
        reset({
          name: "",
          description: "",
          ruleType: "",
          severity: "medium",
          enforcement: "log_only",
          config: "",
          scanMode: "both",
          scopeType: "organization",
          priority: 100,
          enabled: true,
        });
      }
    }
  }, [open, editRule, reset]);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      reset();
    }
    onOpenChange(isOpen);
  };

  const onSubmit = async (values: ContentRuleFormValues) => {
    try {
      let configObj = null;
      if (values.config && values.config.trim()) {
        configObj = JSON.parse(values.config);
      }

      if (isEdit) {
        const { data } = await updateRule({
          variables: {
            input: {
              id: editRule!.id,
              name: values.name,
              description: values.description || null,
              ruleType: values.ruleType,
              severity: values.severity,
              enforcement: values.enforcement,
              scanMode: values.scanMode,
              scopeType: values.scopeType,
              priority: values.priority,
              config: configObj,
              enabled: values.enabled,
            },
          },
        });
        if (data?.updateContentRule?.success) {
          toast.success(`Rule "${values.name}" updated`);
          handleClose(false);
          onSaved();
        } else {
          toast.error(
            data?.updateContentRule?.errors?.[0] ?? "Failed to update rule",
          );
        }
      } else {
        const { data } = await createRule({
          variables: {
            input: {
              name: values.name,
              description: values.description || null,
              ruleType: values.ruleType,
              severity: values.severity,
              enforcement: values.enforcement,
              scanMode: values.scanMode,
              scopeType: values.scopeType,
              priority: values.priority,
              config: configObj,
              enabled: values.enabled,
            },
          },
        });
        if (data?.createContentRule?.success) {
          toast.success(`Rule "${values.name}" created`);
          handleClose(false);
          onSaved();
        } else {
          toast.error(
            data?.createContentRule?.errors?.[0] ?? "Failed to create rule",
          );
        }
      }
    } catch {
      toast.error(isEdit ? "Failed to update rule" : "Failed to create rule");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Content Rule" : "Create Content Rule"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the content scanning rule configuration."
              : "Define a new content scanning and filtering rule."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule-name">Name *</Label>
            <Input
              id="rule-name"
              placeholder="e.g. Block API Keys in Output"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-desc">Description</Label>
            <Textarea
              id="rule-desc"
              placeholder="Describe what this rule checks for..."
              rows={2}
              {...register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label>Rule Type *</Label>
            <Controller
              control={control}
              name="ruleType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-invalid={!!errors.ruleType}>
                    <SelectValue placeholder="Select rule type" />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.ruleType && (
              <p className="text-destructive text-sm">
                {errors.ruleType.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Severity</Label>
              <Controller
                control={control}
                name="severity"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Enforcement</Label>
              <Controller
                control={control}
                name="enforcement"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENFORCEMENT_OPTIONS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Scan mode</Label>
              <Controller
                control={control}
                name="scanMode"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCAN_MODE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Scope</Label>
              <Controller
                control={control}
                name="scopeType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-priority">Priority</Label>
            <Input
              id="rule-priority"
              type="number"
              min={0}
              max={1000}
              {...register("priority", { valueAsNumber: true })}
              aria-invalid={!!errors.priority}
            />
            <p className="text-muted-foreground text-xs">
              Lower runs first. A redact rule at 10 rewrites the text before a
              block rule at 20 decides on it.
            </p>
            {errors.priority && (
              <p className="text-destructive text-sm">
                {errors.priority.message}
              </p>
            )}
          </div>

          {isEdit ? (
            <div className="space-y-2 rounded-md border p-3">
              <Label htmlFor="rule-sample">Try it against a sample</Label>
              <Textarea
                id="rule-sample"
                placeholder="Paste text this rule should or should not match..."
                rows={3}
                value={sample}
                onChange={(event) => setSample(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={runTest}
                  disabled={testing || !sample.trim()}
                >
                  {testing ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : null}
                  Test rule
                </Button>
                {testResult ? (
                  <span
                    className={
                      testResult.matched
                        ? "text-destructive text-sm"
                        : "text-muted-foreground text-sm"
                    }
                  >
                    {testResult.matched
                      ? `Matched — ${testResult.matches?.length ?? 0} hit(s), so this rule would act on that text`
                      : "No match — this rule would let that text through"}
                  </span>
                ) : null}
              </div>
              {testResult?.errors?.length ? (
                <p className="text-destructive text-sm">
                  {testResult.errors[0]}
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                Tests the rule as last saved. Save first to try changes made
                above.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="rule-config">Config (JSON)</Label>
            <Textarea
              id="rule-config"
              placeholder='{"patterns": ["sk-[a-zA-Z0-9]{48}"], "keywords": ["password"]}'
              className="font-mono text-sm"
              rows={5}
              {...register("config")}
              aria-invalid={!!errors.config}
            />
            {errors.config && (
              <p className="text-destructive text-sm">
                {errors.config.message}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Controller
              control={control}
              name="enabled"
              render={({ field }) => (
                <Switch
                  id="rule-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="rule-enabled">Enabled</Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEdit ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

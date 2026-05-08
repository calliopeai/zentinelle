"use client";

import { useEffect } from "react";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import {
  CREATE_CONTENT_RULE,
  UPDATE_CONTENT_RULE,
} from "@/graphql/content-rules/mutations";
import type {
  ContentRuleData,
  CreateContentRulePayload,
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

const contentRuleSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  description: z.string().optional(),
  ruleType: z.string().min(1, "Rule type is required"),
  severity: z.string(),
  enforcement: z.string(),
  config: z.string().optional().refine(
    (val) => {
      if (!val || val.trim() === "") return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Config must be valid JSON" }
  ),
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
      if (editRule) {
        reset({
          name: editRule.name,
          description: editRule.description || "",
          ruleType: editRule.ruleType,
          severity: editRule.severity,
          enforcement: editRule.enforcement,
          config: editRule.config ? JSON.stringify(editRule.config, null, 2) : "",
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
          toast.error(data?.updateContentRule?.errors?.[0] ?? "Failed to update rule");
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
          toast.error(data?.createContentRule?.errors?.[0] ?? "Failed to create rule");
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
          <DialogTitle>{isEdit ? "Edit Content Rule" : "Create Content Rule"}</DialogTitle>
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
              <p className="text-destructive text-sm">{errors.ruleType.message}</p>
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
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

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
              <p className="text-destructive text-sm">{errors.config.message}</p>
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
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

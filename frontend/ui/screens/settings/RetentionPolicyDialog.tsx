"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  Switch,
} from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import {
  type RetentionPolicy,
  type RetentionPolicyInput,
  useSettingsLabels,
} from "./model";

export interface RetentionPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent: a new policy. */
  policy?: RetentionPolicy | null;
  /** CreateRetentionPolicy or UpdateRetentionPolicy; throws with the server's errors. */
  onSave: (input: RetentionPolicyInput) => Promise<void>;
}

function initial(policy?: RetentionPolicy | null): RetentionPolicyInput {
  return {
    name: policy?.name ?? "",
    description: policy?.description ?? "",
    entityType: policy?.entityType ?? "events",
    retentionDays: policy?.retentionDays ?? 90,
    minimumRetentionDays: policy?.minimumRetentionDays ?? null,
    expirationAction: policy?.expirationAction ?? "delete",
    complianceRequirement: policy?.complianceRequirement ?? "none",
    priority: policy?.priority ?? 0,
    enabled: policy?.enabled ?? true,
  };
}

function RetentionPolicyBody({
  open,
  onOpenChange,
  policy,
  onSave,
}: RetentionPolicyDialogProps) {
  const t = useTranslations("settings.retentionPolicyDialog");
  const {
    COMPLIANCE_REQUIREMENTS,
    EXPIRATION_ACTIONS,
    RETENTION_ENTITY_TYPES,
  } = useSettingsLabels();
  const [values, setValues] = React.useState(() => initial(policy));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = <K extends keyof RetentionPolicyInput>(
    key: K,
    value: RetentionPolicyInput[K],
  ) => setValues({ ...values, [key]: value });
  const nameError = values.name.trim() ? null : t("nameThePolicy");
  const daysError =
    values.retentionDays < 1
      ? t("keepDataForAtLeast")
      : values.minimumRetentionDays !== null &&
          values.minimumRetentionDays > values.retentionDays
        ? t("theMinimumCannotExceedThe")
        : null;
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (nameError || daysError) return;
            setPending(true);
            setError(null);
            try {
              await onSave({ ...values, name: values.name.trim() });
              onOpenChange(false);
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : t("thePolicyWasNotSaved"),
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {policy ? `Edit ${policy.name}` : t("newRetentionPolicy")}
            </DialogTitle>
            <DialogDescription>{t("anActiveLegalHoldKeeps")}</DialogDescription>
          </DialogHeader>
          <Field label={t("name")} error={values.name ? null : nameError}>
            <Input
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label={t("description")}>
            <Input
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("data")}>
              <Select
                options={RETENTION_ENTITY_TYPES}
                value={values.entityType}
                onValueChange={(v) => set("entityType", v)}
                className="w-full"
              />
            </Field>
            <Field label={t("afterItExpires")}>
              <Select
                options={EXPIRATION_ACTIONS}
                value={values.expirationAction}
                onValueChange={(v) => set("expirationAction", v)}
                className="w-full"
              />
            </Field>
            <Field label={t("keepForDays")} error={daysError}>
              <Input
                type="number"
                min={1}
                value={values.retentionDays}
                onChange={(e) => set("retentionDays", Number(e.target.value))}
              />
            </Field>
            <Field label={t("minimumDays")} hint={t("aFloorNoOneCan")}>
              <Input
                type="number"
                min={0}
                value={values.minimumRetentionDays ?? ""}
                onChange={(e) =>
                  set(
                    "minimumRetentionDays",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field label={t("requirement")}>
              <Select
                options={COMPLIANCE_REQUIREMENTS}
                value={values.complianceRequirement}
                onValueChange={(v) => set("complianceRequirement", v)}
                className="w-full"
              />
            </Field>
            <Field label={t("priority")} hint={t("theHigherNumberWinsWhen")}>
              <Input
                type="number"
                value={values.priority}
                onChange={(e) => set("priority", Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label={t("enabled")} orientation="horizontal" className="py-2">
            <Switch
              checked={values.enabled}
              onCheckedChange={(enabled) => set("enabled", enabled)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={pending || Boolean(nameError || daysError)}
            >
              {pending
                ? t("saving")
                : policy
                  ? t("savePolicy")
                  : t("createPolicy")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * How long one kind of data is kept, and what happens to it after. The form
 * mounts on open, so each opening starts from the policy as it is now.
 */
export function RetentionPolicyDialog(props: RetentionPolicyDialogProps) {
  return props.open ? (
    <RetentionPolicyBody key={props.policy?.id ?? "new"} {...props} />
  ) : null;
}

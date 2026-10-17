"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@calliopelabs/ui";
import * as React from "react";

import { FormField, Select } from "./components/FormField";
import { SwitchField } from "../../shared/SwitchField";
import {
  COMPLIANCE_REQUIREMENTS,
  EXPIRATION_ACTIONS,
  RETENTION_ENTITY_TYPES,
  type RetentionPolicy,
  type RetentionPolicyInput,
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
  const [values, setValues] = React.useState(() => initial(policy));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = <K extends keyof RetentionPolicyInput>(
    key: K,
    value: RetentionPolicyInput[K],
  ) => setValues({ ...values, [key]: value });
  const nameError = values.name.trim() ? null : "Name the policy.";
  const daysError =
    values.retentionDays < 1
      ? "Keep data for at least a day."
      : values.minimumRetentionDays !== null &&
          values.minimumRetentionDays > values.retentionDays
        ? "The minimum cannot exceed the retention period."
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
                  : "The policy was not saved.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {policy ? `Edit ${policy.name}` : "New retention policy"}
            </DialogTitle>
            <DialogDescription>
              An active legal hold keeps data past its expiry, whatever this
              policy says.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Name" error={values.name ? null : nameError}>
            {(control) => (
              <Input
                {...control}
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Description">
            {(control) => (
              <Input
                {...control}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
              />
            )}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Data">
              {(control) => (
                <Select
                  {...control}
                  options={RETENTION_ENTITY_TYPES}
                  value={values.entityType}
                  onChange={(e) => set("entityType", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="After it expires">
              {(control) => (
                <Select
                  {...control}
                  options={EXPIRATION_ACTIONS}
                  value={values.expirationAction}
                  onChange={(e) => set("expirationAction", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Keep for (days)" error={daysError}>
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min={1}
                  value={values.retentionDays}
                  onChange={(e) => set("retentionDays", Number(e.target.value))}
                />
              )}
            </FormField>
            <FormField
              label="Minimum (days)"
              hint="A floor no one can shorten, for regulated data."
            >
              {(control) => (
                <Input
                  {...control}
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
              )}
            </FormField>
            <FormField label="Requirement">
              {(control) => (
                <Select
                  {...control}
                  options={COMPLIANCE_REQUIREMENTS}
                  value={values.complianceRequirement}
                  onChange={(e) => set("complianceRequirement", e.target.value)}
                />
              )}
            </FormField>
            <FormField
              label="Priority"
              hint="The higher number wins when two policies cover the same data."
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  value={values.priority}
                  onChange={(e) => set("priority", Number(e.target.value))}
                />
              )}
            </FormField>
          </div>
          <SwitchField
            label="Enabled"
            checked={values.enabled}
            onCheckedChange={(enabled) => set("enabled", enabled)}
          />
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || Boolean(nameError || daysError)}
            >
              {pending ? "Saving" : policy ? "Save policy" : "Create policy"}
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

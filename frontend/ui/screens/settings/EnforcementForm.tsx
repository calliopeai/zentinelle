"use client";

import { Section } from "@calliopelabs/ui";
import * as React from "react";

import {
  FormActions,
  FormField,
  Select,
  useSaveState,
} from "./components/FormField";
import { SwitchField } from "../../shared/SwitchField";
import {
  ENFORCEMENT_MODES,
  type Organization,
  type OrganizationUpdate,
  type Save,
} from "./model";

export interface EnforcementFormProps {
  organization: Organization;
  onSave: Save<OrganizationUpdate>;
}

/** General > Enforcement: the mode a new policy starts in, and whether decisions are recorded. */
export function EnforcementForm({
  organization,
  onSave,
}: EnforcementFormProps) {
  const settings = organization.settings ?? {};
  const initial = {
    defaultPolicyMode: settings.default_policy_mode ?? "monitor",
    auditLogging: settings.audit_logging ?? true,
  };
  const [values, setValues] = React.useState(initial);
  const save = useSaveState();
  const dirty =
    values.defaultPolicyMode !== initial.defaultPolicyMode ||
    values.auditLogging !== initial.auditLogging;
  return (
    <Section
      title="Enforcement"
      description="Defaults for policies that do not set their own."
    >
      <form
        className="grid max-w-2xl gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(() => onSave(values));
        }}
      >
        <FormField
          label="Default enforcement mode"
          hint="New policies start in this mode. Monitor records what a policy would have done without acting."
          className="sm:max-w-sm"
        >
          {(control) => (
            <Select
              {...control}
              value={values.defaultPolicyMode}
              options={ENFORCEMENT_MODES}
              onChange={(event) => {
                save.reset();
                setValues({ ...values, defaultPolicyMode: event.target.value });
              }}
            />
          )}
        </FormField>
        <SwitchField
          label="Audit logging"
          description="Record every policy decision in the audit log, for compliance review."
          checked={values.auditLogging}
          onCheckedChange={(auditLogging) => {
            save.reset();
            setValues({ ...values, auditLogging });
          }}
        />
        <FormActions
          submitLabel="Save enforcement"
          disabled={!dirty}
          {...save}
        />
      </form>
    </Section>
  );
}

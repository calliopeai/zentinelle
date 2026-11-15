"use client";

import { Field, Section, Select, Switch } from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import { FormActions, useSaveState } from "./components/FormField";
import {
  type Organization,
  type OrganizationUpdate,
  type Save,
  useSettingsLabels,
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
  const t = useTranslations("settings.enforcementForm");
  const { ENFORCEMENT_MODES } = useSettingsLabels();
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
      title={t("enforcement")}
      description={t("defaultsForPoliciesThatDo")}
    >
      <form
        className="grid max-w-2xl gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(() => onSave(values));
        }}
      >
        <Field
          label={t("defaultEnforcementMode")}
          hint={t("newPoliciesStartInThis")}
          className="sm:max-w-sm"
        >
          <Select
            value={values.defaultPolicyMode}
            options={ENFORCEMENT_MODES}
            onValueChange={(defaultPolicyMode) => {
              save.reset();
              setValues({ ...values, defaultPolicyMode });
            }}
            className="w-full"
          />
        </Field>
        <Field
          label={t("auditLogging")}
          hint={t("recordEveryPolicyDecisionIn")}
          orientation="horizontal"
          className="py-2"
        >
          <Switch
            checked={values.auditLogging}
            onCheckedChange={(auditLogging) => {
              save.reset();
              setValues({ ...values, auditLogging });
            }}
          />
        </Field>
        <FormActions
          submitLabel={t("saveEnforcement")}
          disabled={!dirty}
          {...save}
        />
      </form>
    </Section>
  );
}

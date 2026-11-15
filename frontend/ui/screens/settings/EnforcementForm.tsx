"use client";

import { Section } from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import {
  FormActions,
  FormField,
  Select,
  useSaveState,
} from "./components/FormField";
import { SwitchField } from "../../shared/SwitchField";
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
        <FormField
          label={t("defaultEnforcementMode")}
          hint={t("newPoliciesStartInThis")}
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
          label={t("auditLogging")}
          description={t("recordEveryPolicyDecisionIn")}
          checked={values.auditLogging}
          onCheckedChange={(auditLogging) => {
            save.reset();
            setValues({ ...values, auditLogging });
          }}
        />
        <FormActions
          submitLabel={t("saveEnforcement")}
          disabled={!dirty}
          {...save}
        />
      </form>
    </Section>
  );
}

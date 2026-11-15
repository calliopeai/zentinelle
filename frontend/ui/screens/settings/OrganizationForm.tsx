"use client";

import { Input, Section } from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import { DefinitionList } from "./components/DefinitionList";
import { FormActions, FormField, useSaveState } from "./components/FormField";
import {
  type Organization,
  type OrganizationUpdate,
  type Save,
  useSettingsLabels,
} from "./model";

export interface OrganizationFormProps {
  organization: Organization;
  onSave: Save<OrganizationUpdate>;
}

/** General > Organization: the name and contact people see, and the facts nobody edits here. */
export function OrganizationForm({
  organization,
  onSave,
}: OrganizationFormProps) {
  const t = useTranslations("settings.organizationForm");
  const { formatDay } = useSettingsLabels();
  const settings = organization.settings ?? {};
  const initial = {
    name: organization.name ?? "",
    contactEmail: settings.contact_email ?? "",
    timezone: settings.timezone ?? "UTC",
  };
  const [values, setValues] = React.useState(initial);
  const save = useSaveState();
  const dirty =
    values.name !== initial.name ||
    values.contactEmail !== initial.contactEmail ||
    values.timezone !== initial.timezone;
  const nameError = values.name.trim() ? null : t("theOrganizationNeedsAName");
  const set =
    (key: keyof typeof values) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      save.reset();
      setValues({ ...values, [key]: event.target.value });
    };
  return (
    <>
      <Section
        title={t("organization")}
        description={t("howZentinelleAiNamesThis")}
      >
        <form
          className="grid max-w-2xl gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (nameError) return;
            void save.run(() =>
              onSave({
                name: values.name.trim(),
                contactEmail: values.contactEmail.trim() || null,
                timezone: values.timezone.trim() || null,
              }),
            );
          }}
        >
          <FormField label={t("name")} error={dirty ? nameError : null}>
            {(control) => (
              <Input
                {...control}
                value={values.name}
                onChange={set("name")}
                autoComplete="organization"
              />
            )}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t("contactEmail")}
              hint={t("alertsAndIncidentNoticesGo")}
            >
              {(control) => (
                <Input
                  {...control}
                  type="email"
                  value={values.contactEmail}
                  onChange={set("contactEmail")}
                  autoComplete="email"
                />
              )}
            </FormField>
            <FormField label={t("timeZone")} hint={t("anIanaNameSuchAs")}>
              {(control) => (
                <Input
                  {...control}
                  value={values.timezone}
                  onChange={set("timezone")}
                />
              )}
            </FormField>
          </div>
          <FormActions
            submitLabel={t("saveOrganization")}
            disabled={!dirty || Boolean(nameError)}
            {...save}
          />
        </form>
      </Section>
      <Section
        title={t("account")}
        description={t("setWhenTheOrganizationWas")}
        divided
      >
        <DefinitionList
          items={[
            { term: t("slug"), value: organization.slug, mono: true },
            { term: t("plan"), value: organization.tier },
            { term: t("zentinelleAiTier"), value: organization.zentinelleTier },
            { term: t("deployment"), value: organization.deploymentModel },
            { term: t("created"), value: formatDay(organization.createdAt) },
          ]}
        />
      </Section>
    </>
  );
}

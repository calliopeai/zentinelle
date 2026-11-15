"use client";

import { Field, Input, Section, DefinitionList } from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import { FormActions, useSaveState } from "./components/FormField";
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
          <Field label={t("name")} error={dirty ? nameError : null}>
            <Input
              value={values.name}
              onChange={set("name")}
              autoComplete="organization"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("contactEmail")}
              hint={t("alertsAndIncidentNoticesGo")}
            >
              <Input
                type="email"
                value={values.contactEmail}
                onChange={set("contactEmail")}
                autoComplete="email"
              />
            </Field>
            <Field label={t("timeZone")} hint={t("anIanaNameSuchAs")}>
              <Input value={values.timezone} onChange={set("timezone")} />
            </Field>
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
            {
              term: t("slug"),
              description: organization.slug ? (
                <span className="font-mono text-xs">{organization.slug}</span>
              ) : null,
            },
            { term: t("plan"), description: organization.tier },
            {
              term: t("zentinelleAiTier"),
              description: organization.zentinelleTier,
            },
            {
              term: t("deployment"),
              description: organization.deploymentModel,
            },
            {
              term: t("created"),
              description: formatDay(organization.createdAt) || null,
            },
          ]}
        />
      </Section>
    </>
  );
}

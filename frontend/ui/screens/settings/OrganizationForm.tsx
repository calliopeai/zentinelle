"use client";

import { Input, Section } from "@calliopelabs/ui";
import * as React from "react";

import { DefinitionList } from "./components/DefinitionList";
import { FormActions, FormField, useSaveState } from "./components/FormField";
import {
  formatDay,
  type Organization,
  type OrganizationUpdate,
  type Save,
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
  const nameError = values.name.trim()
    ? null
    : "The organization needs a name.";
  const set =
    (key: keyof typeof values) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      save.reset();
      setValues({ ...values, [key]: event.target.value });
    };
  return (
    <>
      <Section
        title="Organization"
        description="How Zentinelle AI names this organization, and where it sends mail."
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
          <FormField label="Name" error={dirty ? nameError : null}>
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
              label="Contact email"
              hint="Alerts and incident notices go here."
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
            <FormField
              label="Time zone"
              hint="An IANA name, such as Europe/London."
            >
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
            submitLabel="Save organization"
            disabled={!dirty || Boolean(nameError)}
            {...save}
          />
        </form>
      </Section>
      <Section
        title="Account"
        description="Set when the organization was provisioned."
        divided
      >
        <DefinitionList
          items={[
            { term: "Slug", value: organization.slug, mono: true },
            { term: "Plan", value: organization.tier },
            { term: "Zentinelle AI tier", value: organization.zentinelleTier },
            { term: "Deployment", value: organization.deploymentModel },
            { term: "Created", value: formatDay(organization.createdAt) },
          ]}
        />
      </Section>
    </>
  );
}

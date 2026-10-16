"use client";

import { Input, Section } from "@calliopelabs/ui";
import * as React from "react";

import { FormActions, FormField, useSaveState } from "../../shared/FormField";
import { SwitchField } from "../../shared/SwitchField";
import type { Organization, OrganizationUpdate, Save } from "./model";

export interface NotificationsFormProps {
  organization: Organization;
  onSave: Save<OrganizationUpdate>;
}

function webhookError(url: string, slack: boolean): string | null {
  if (!url) return slack ? "Slack notifications need a webhook URL." : null;
  return /^https:\/\/\S+$/.test(url)
    ? null
    : "Enter a URL that starts with https://.";
}

/** General > Notifications: where alerts and incidents go. */
export function NotificationsForm({
  organization,
  onSave,
}: NotificationsFormProps) {
  const settings = organization.settings ?? {};
  const initial = {
    emailNotifications: settings.email_notifications ?? false,
    slackNotifications: settings.slack_notifications ?? false,
    webhookUrl: settings.webhook_url ?? "",
  };
  const [values, setValues] = React.useState(initial);
  const save = useSaveState();
  const dirty =
    values.emailNotifications !== initial.emailNotifications ||
    values.slackNotifications !== initial.slackNotifications ||
    values.webhookUrl !== initial.webhookUrl;
  const error = webhookError(
    values.webhookUrl.trim(),
    values.slackNotifications,
  );
  const contact = settings.contact_email;
  return (
    <Section
      title="Notifications"
      description="Where Zentinelle AI sends alerts and incidents."
    >
      <form
        className="grid max-w-2xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (error) return;
          void save.run(() =>
            onSave({ ...values, webhookUrl: values.webhookUrl.trim() || null }),
          );
        }}
      >
        <SwitchField
          label="Email"
          description={
            contact
              ? `Send alerts and incidents to ${contact}.`
              : "Send alerts and incidents to the contact email, once one is set under Organization."
          }
          checked={values.emailNotifications}
          onCheckedChange={(emailNotifications) => {
            save.reset();
            setValues({ ...values, emailNotifications });
          }}
        />
        <SwitchField
          label="Slack"
          description="Post alerts and incidents to a Slack channel through an incoming webhook."
          checked={values.slackNotifications}
          onCheckedChange={(slackNotifications) => {
            save.reset();
            setValues({ ...values, slackNotifications });
          }}
        />
        <FormField
          label="Webhook URL"
          error={dirty ? error : null}
          className="pt-2"
        >
          {(control) => (
            <Input
              {...control}
              type="url"
              inputMode="url"
              placeholder="https://hooks.slack.com/services/..."
              value={values.webhookUrl}
              onChange={(event) => {
                save.reset();
                setValues({ ...values, webhookUrl: event.target.value });
              }}
            />
          )}
        </FormField>
        <FormActions
          submitLabel="Save notifications"
          disabled={!dirty || Boolean(error)}
          {...save}
        />
      </form>
    </Section>
  );
}

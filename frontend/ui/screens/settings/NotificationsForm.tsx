"use client";

import { Input, Section } from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import { FormActions, FormField, useSaveState } from "./components/FormField";
import { SwitchField } from "../../shared/SwitchField";
import type { Organization, OrganizationUpdate, Save } from "./model";

export interface NotificationsFormProps {
  organization: Organization;
  onSave: Save<OrganizationUpdate>;
}

function webhookError(
  url: string,
  slack: boolean,
  t: (key: string) => string,
): string | null {
  if (!url) return slack ? t("slackNotificationsNeedAWebhook") : null;
  return /^https:\/\/\S+$/.test(url) ? null : t("enterAUrlThatStarts");
}

/** General > Notifications: where alerts and incidents go. */
export function NotificationsForm({
  organization,
  onSave,
}: NotificationsFormProps) {
  const t = useTranslations("settings.notificationsForm");
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
    t,
  );
  const contact = settings.contact_email;
  return (
    <Section
      title={t("notifications")}
      description={t("whereZentinelleAiSendsAlerts")}
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
          label={t("email")}
          description={
            contact ? t("sendTo", { contact }) : t("sendAlertsAndIncidentsTo")
          }
          checked={values.emailNotifications}
          onCheckedChange={(emailNotifications) => {
            save.reset();
            setValues({ ...values, emailNotifications });
          }}
        />
        <SwitchField
          label={t("slack")}
          description={t("postAlertsAndIncidentsTo")}
          checked={values.slackNotifications}
          onCheckedChange={(slackNotifications) => {
            save.reset();
            setValues({ ...values, slackNotifications });
          }}
        />
        <FormField
          label={t("webhookUrl")}
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
          submitLabel={t("saveNotifications")}
          disabled={!dirty || Boolean(error)}
          {...save}
        />
      </form>
    </Section>
  );
}

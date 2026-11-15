"use client";

import { Field, Input, Section, Select, Switch } from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import { FormActions, useSaveState } from "./components/FormField";
import {
  changedKeys,
  splitList,
  type RuntimeActions,
  type RuntimeSnapshot,
  useSettingsLabels,
} from "./model";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface RuntimeFormProps {
  snapshot: RuntimeSnapshot;
  onStage: RuntimeActions["onStage"];
}

const CAPTURE = (t: Translate) => [
  { value: "metadata", label: t("metadataOnly") },
  { value: "redacted", label: t("redactedContent") },
  { value: "full", label: t("fullContent") },
];

const VISIBILITY = (t: Translate) => [
  { value: "enabled_only", label: t("enabledModels") },
  { value: "all_registered", label: t("allRegisteredModels") },
  { value: "approved_only", label: t("modelsAPolicyApproves") },
];

/**
 * General > Runtime: the tenant's operational knobs (backend
 * RuntimeSettingsView; the assistant's keys live under Settings >
 * Assistant). A save stages a change; it takes effect once approved and
 * applied. Bounds are the server's (SETTING_SCHEMA).
 */
export function RuntimeForm({ snapshot, onStage }: RuntimeFormProps) {
  const t = useTranslations("settings.runtimeForm");
  const { provenanceHint } = useSettingsLabels();
  const s = snapshot.settings;
  const initial = {
    content_capture_mode: s.content_capture_mode,
    model_visibility: s.model_visibility,
    discovery_refresh_seconds: s.discovery_refresh_seconds,
    default_rate_limit_per_minute: s.default_rate_limit_per_minute,
    default_budget_cents: s.default_budget_cents,
    taxonomy_extensions: s.taxonomy_extensions.join(", "),
    control_approval_required: s.control_approval_required,
  };
  const [values, setValues] = React.useState(initial);
  const save = useSaveState();
  const hint = (key: keyof typeof initial) =>
    provenanceHint(snapshot.effective[key]);
  const update = <K extends keyof typeof initial>(
    key: K,
    value: (typeof initial)[K],
  ) => {
    save.reset();
    setValues({ ...values, [key]: value });
  };
  const changes = changedKeys(initial, values);
  const refreshError =
    values.discovery_refresh_seconds < 300 ||
    values.discovery_refresh_seconds > 86400
      ? t("from300To86400")
      : null;
  return (
    <Section
      title={t("runtime")}
      description={t("captureModelDiscoveryAndThe")}
    >
      <form
        className="grid max-w-3xl gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const { taxonomy_extensions, ...rest } = changes;
          void save.run(() =>
            onStage({
              ...rest,
              ...(taxonomy_extensions !== undefined && {
                taxonomy_extensions: splitList(taxonomy_extensions),
              }),
            }),
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("contentCapture")}
            hint={hint("content_capture_mode")}
          >
            <Select
              options={CAPTURE(t)}
              value={values.content_capture_mode}
              onValueChange={(v) => update("content_capture_mode", v)}
              className="w-full"
            />
          </Field>
          <Field label={t("modelVisibility")} hint={hint("model_visibility")}>
            <Select
              options={VISIBILITY(t)}
              value={values.model_visibility}
              onValueChange={(v) => update("model_visibility", v)}
              className="w-full"
            />
          </Field>
          <Field
            label={t("modelDiscoveryEverySeconds")}
            hint={hint("discovery_refresh_seconds")}
            error={refreshError}
          >
            <Input
              type="number"
              min={300}
              max={86400}
              value={values.discovery_refresh_seconds}
              onChange={(e) =>
                update("discovery_refresh_seconds", Number(e.target.value))
              }
            />
          </Field>
          <Field
            label={t("defaultRateLimitPerMinute")}
            hint={hint("default_rate_limit_per_minute")}
          >
            <Input
              type="number"
              min={1}
              max={100000}
              value={values.default_rate_limit_per_minute}
              onChange={(e) =>
                update("default_rate_limit_per_minute", Number(e.target.value))
              }
            />
          </Field>
          <Field
            label={t("defaultBudgetCents")}
            hint={hint("default_budget_cents") ?? "0 means no default budget."}
          >
            <Input
              type="number"
              min={0}
              max={100000000}
              value={values.default_budget_cents}
              onChange={(e) =>
                update("default_budget_cents", Number(e.target.value))
              }
            />
          </Field>
          <Field
            label={t("taxonomyExtensions")}
            hint={
              hint("taxonomy_extensions") ?? t("commaSeparatedSuchAsProject")
            }
          >
            <Input
              placeholder={t("projectPhoenixClientAcme")}
              value={values.taxonomy_extensions}
              onChange={(e) => update("taxonomy_extensions", e.target.value)}
            />
          </Field>
        </div>
        <Field
          label={t("requireApprovalForContainment")}
          hint={t("suspendRevokeAndToolContainment")}
          orientation="horizontal"
          className="py-2"
        >
          <Switch
            checked={values.control_approval_required}
            onCheckedChange={(checked) =>
              update("control_approval_required", checked)
            }
          />
        </Field>
        <FormActions
          submitLabel={t("stageChanges")}
          pendingLabel="Staging"
          savedLabel={t("stagedForApproval")}
          disabled={Object.keys(changes).length === 0 || Boolean(refreshError)}
          {...save}
        >
          Revision {snapshot.revision} in effect
        </FormActions>
      </form>
    </Section>
  );
}

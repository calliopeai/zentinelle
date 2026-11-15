"use client";

import { Field, Input, Section, Switch } from "@calliopelabs/ui";
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

export interface AssistantFormProps {
  snapshot: RuntimeSnapshot;
  onStage: RuntimeActions["onStage"];
}

/**
 * Settings > Assistant: the model behind the assistant dock and what it may
 * talk about (the runtime keys assistant_provider, assistant_model,
 * assistant_allowed_topics and policy_copilot_enabled; assistant-ag-ui §2).
 * Staged and approved like every runtime change.
 */
export function AssistantForm({ snapshot, onStage }: AssistantFormProps) {
  const t = useTranslations("settings.assistantForm");
  const { provenanceHint } = useSettingsLabels();
  const s = snapshot.settings;
  const initial = {
    assistant_provider: s.assistant_provider,
    assistant_model: s.assistant_model,
    assistant_allowed_topics: s.assistant_allowed_topics.join(", "),
    policy_copilot_enabled: s.policy_copilot_enabled,
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
  return (
    <Section
      title={t("modelAndScope")}
      description={t("leaveTheProviderAndModel")}
    >
      <form
        className="grid max-w-3xl gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const { assistant_allowed_topics, ...rest } = changes;
          void save.run(() =>
            onStage({
              ...rest,
              ...(assistant_allowed_topics !== undefined && {
                assistant_allowed_topics: splitList(assistant_allowed_topics),
              }),
            }),
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("provider")}
            hint={hint("assistant_provider") ?? t("aProviderSetUpUnder")}
          >
            <Input
              placeholder="lmstudio"
              value={values.assistant_provider}
              onChange={(e) => update("assistant_provider", e.target.value)}
            />
          </Field>
          <Field label={t("model")} hint={hint("assistant_model")}>
            <Input
              placeholder={t("theProviderSDefault")}
              value={values.assistant_model}
              onChange={(e) => update("assistant_model", e.target.value)}
            />
          </Field>
        </div>
        <Field
          label={t("allowedTopics")}
          hint={
            hint("assistant_allowed_topics") ??
            t("commaSeparatedTheAssistantDeclines")
          }
        >
          <Input
            placeholder={t("governancePoliciesIncidents")}
            value={values.assistant_allowed_topics}
            onChange={(e) => update("assistant_allowed_topics", e.target.value)}
          />
        </Field>
        <Field
          label={t("policyDrafting")}
          hint={t("theAssistantMayDraftPolicy")}
          orientation="horizontal"
          className="py-2"
        >
          <Switch
            checked={values.policy_copilot_enabled}
            onCheckedChange={(checked) =>
              update("policy_copilot_enabled", checked)
            }
          />
        </Field>
        <FormActions
          submitLabel={t("stageChanges")}
          pendingLabel="Staging"
          savedLabel={t("stagedForApproval")}
          disabled={Object.keys(changes).length === 0}
          {...save}
        >
          Revision {snapshot.revision} in effect
        </FormActions>
      </form>
    </Section>
  );
}

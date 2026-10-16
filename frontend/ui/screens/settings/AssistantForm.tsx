"use client";

import { Input, Section } from "@calliopelabs/ui";
import * as React from "react";

import { FormActions, FormField, useSaveState } from "../../shared/FormField";
import { SwitchField } from "../../shared/SwitchField";
import {
  changedKeys,
  provenanceHint,
  splitList,
  type RuntimeActions,
  type RuntimeSnapshot,
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
      title="Model and scope"
      description="Leave the provider and model empty to use the shared in-cluster model."
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
          <FormField
            label="Provider"
            hint={
              hint("assistant_provider") ??
              "A provider set up under Models & usage > Providers."
            }
          >
            {(control) => (
              <Input
                {...control}
                placeholder="lmstudio"
                value={values.assistant_provider}
                onChange={(e) => update("assistant_provider", e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Model" hint={hint("assistant_model")}>
            {(control) => (
              <Input
                {...control}
                placeholder="The provider's default"
                value={values.assistant_model}
                onChange={(e) => update("assistant_model", e.target.value)}
              />
            )}
          </FormField>
        </div>
        <FormField
          label="Allowed topics"
          hint={
            hint("assistant_allowed_topics") ??
            "Comma separated. The assistant declines anything else."
          }
        >
          {(control) => (
            <Input
              {...control}
              placeholder="governance, policies, incidents"
              value={values.assistant_allowed_topics}
              onChange={(e) =>
                update("assistant_allowed_topics", e.target.value)
              }
            />
          )}
        </FormField>
        <SwitchField
          label="Policy drafting"
          description="The assistant may draft policy changes and stage them for approval. Needs an active provider key."
          checked={values.policy_copilot_enabled}
          onCheckedChange={(checked) =>
            update("policy_copilot_enabled", checked)
          }
        />
        <FormActions
          submitLabel="Stage changes"
          pendingLabel="Staging"
          savedLabel="Staged for approval"
          disabled={Object.keys(changes).length === 0}
          {...save}
        >
          Revision {snapshot.revision} in effect
        </FormActions>
      </form>
    </Section>
  );
}

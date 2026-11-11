"use client";

import { Input, Section } from "@calliopelabs/ui";
import * as React from "react";

import {
  FormActions,
  FormField,
  Select,
  useSaveState,
} from "./components/FormField";
import { SwitchField } from "../../shared/SwitchField";
import {
  changedKeys,
  provenanceHint,
  splitList,
  type RuntimeActions,
  type RuntimeSnapshot,
} from "./model";

export interface RuntimeFormProps {
  snapshot: RuntimeSnapshot;
  onStage: RuntimeActions["onStage"];
}

const CAPTURE = [
  { value: "metadata", label: "Metadata only" },
  { value: "redacted", label: "Redacted content" },
  { value: "full", label: "Full content" },
];

const VISIBILITY = [
  { value: "enabled_only", label: "Enabled models" },
  { value: "all_registered", label: "All registered models" },
  { value: "approved_only", label: "Models a policy approves" },
];

/**
 * General > Runtime: the tenant's operational knobs (backend
 * RuntimeSettingsView; the assistant's keys live under Settings >
 * Assistant). A save stages a change; it takes effect once approved and
 * applied. Bounds are the server's (SETTING_SCHEMA).
 */
export function RuntimeForm({ snapshot, onStage }: RuntimeFormProps) {
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
      ? "From 300 to 86,400 seconds."
      : null;
  return (
    <Section
      title="Runtime"
      description="Capture, model discovery and the defaults agents get when no policy says otherwise."
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
          <FormField
            label="Content capture"
            hint={hint("content_capture_mode")}
          >
            {(control) => (
              <Select
                {...control}
                options={CAPTURE}
                value={values.content_capture_mode}
                onChange={(e) => update("content_capture_mode", e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Model visibility" hint={hint("model_visibility")}>
            {(control) => (
              <Select
                {...control}
                options={VISIBILITY}
                value={values.model_visibility}
                onChange={(e) => update("model_visibility", e.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="Model discovery, every (seconds)"
            hint={hint("discovery_refresh_seconds")}
            error={refreshError}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                min={300}
                max={86400}
                value={values.discovery_refresh_seconds}
                onChange={(e) =>
                  update("discovery_refresh_seconds", Number(e.target.value))
                }
              />
            )}
          </FormField>
          <FormField
            label="Default rate limit, per minute"
            hint={hint("default_rate_limit_per_minute")}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                min={1}
                max={100000}
                value={values.default_rate_limit_per_minute}
                onChange={(e) =>
                  update(
                    "default_rate_limit_per_minute",
                    Number(e.target.value),
                  )
                }
              />
            )}
          </FormField>
          <FormField
            label="Default budget (cents)"
            hint={hint("default_budget_cents") ?? "0 means no default budget."}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                min={0}
                max={100000000}
                value={values.default_budget_cents}
                onChange={(e) =>
                  update("default_budget_cents", Number(e.target.value))
                }
              />
            )}
          </FormField>
          <FormField
            label="Taxonomy extensions"
            hint={
              hint("taxonomy_extensions") ??
              "Comma separated, such as project:phoenix, client:acme."
            }
          >
            {(control) => (
              <Input
                {...control}
                placeholder="project:phoenix, client:acme"
                value={values.taxonomy_extensions}
                onChange={(e) => update("taxonomy_extensions", e.target.value)}
              />
            )}
          </FormField>
        </div>
        <SwitchField
          label="Require approval for containment"
          description="Suspend, revoke and tool containment wait for a person to approve the exact action."
          checked={values.control_approval_required}
          onCheckedChange={(checked) =>
            update("control_approval_required", checked)
          }
        />
        <FormActions
          submitLabel="Stage changes"
          pendingLabel="Staging"
          savedLabel="Staged for approval"
          disabled={Object.keys(changes).length === 0 || Boolean(refreshError)}
          {...save}
        >
          Revision {snapshot.revision} in effect
        </FormActions>
      </form>
    </Section>
  );
}

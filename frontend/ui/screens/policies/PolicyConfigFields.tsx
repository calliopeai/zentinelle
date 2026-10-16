import { Checkbox, Input } from "@calliopelabs/ui";
import * as React from "react";

import { Field } from "../../shared/Field";
import { Textarea } from "../../shared/Textarea";
import {
  configFieldsOf,
  fromFieldText,
  toFieldText,
  type ConfigField,
} from "./map";

export interface PolicyConfigFieldsProps {
  /** The type's `configSchema` from `GetPolicyOptions`. */
  schema: Record<string, unknown> | null | undefined;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  /** Field errors by key, set by the editor on submit. */
  errors?: Record<string, string>;
  disabled?: boolean;
}

function CheckboxField({
  field,
  checked,
  onChange,
  disabled,
}: {
  field: ConfigField;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
      />
      <label htmlFor={id} className="text-sm">
        {field.label}
      </label>
    </div>
  );
}

/**
 * A policy type's configuration as typed fields: lists one item per line,
 * flags as checkboxes, numbers as numbers. Keys the schema does not name
 * are kept as they are, so editing never drops what another client wrote.
 */
export function PolicyConfigFields({
  schema,
  value,
  onChange,
  errors = {},
  disabled,
}: PolicyConfigFieldsProps) {
  const fields = configFieldsOf(schema);
  const [text, setText] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => [f.key, toFieldText(value[f.key], f.kind)]),
    ),
  );
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This policy type takes no configuration.
      </p>
    );
  }
  const set = (field: ConfigField, raw: string) => {
    setText((t) => ({ ...t, [field.key]: raw }));
    const parsed = fromFieldText(raw, field.kind);
    const next = { ...value };
    if (parsed.value === undefined) delete next[field.key];
    else next[field.key] = parsed.value;
    if (!parsed.error) onChange(next);
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) =>
        field.kind === "bool" ? (
          <CheckboxField
            key={field.key}
            field={field}
            checked={value[field.key] === true}
            disabled={disabled}
            onChange={(v) => onChange({ ...value, [field.key]: v })}
          />
        ) : (
          <Field
            key={field.key}
            label={field.label}
            hint={field.kind === "list" ? "One per line." : undefined}
            error={
              errors[field.key] ??
              fromFieldText(text[field.key] ?? "", field.kind).error
            }
            className={field.kind === "list" ? "sm:col-span-2" : undefined}
          >
            {(c) =>
              field.kind === "list" ? (
                <Textarea
                  {...c}
                  mono
                  rows={4}
                  disabled={disabled}
                  value={text[field.key] ?? ""}
                  onChange={(e) => set(field, e.target.value)}
                />
              ) : (
                <Input
                  {...c}
                  inputMode={
                    field.kind === "int"
                      ? "numeric"
                      : field.kind === "float"
                        ? "decimal"
                        : undefined
                  }
                  disabled={disabled}
                  value={text[field.key] ?? ""}
                  onChange={(e) => set(field, e.target.value)}
                />
              )
            }
          </Field>
        ),
      )}
    </div>
  );
}

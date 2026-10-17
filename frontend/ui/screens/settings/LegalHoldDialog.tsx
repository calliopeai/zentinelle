"use client";

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@calliopelabs/ui";
import * as React from "react";

import { FormField, Select, type SelectOption } from "./components/FormField";
import { SwitchField } from "../../shared/SwitchField";
import { RETENTION_ENTITY_TYPES, type LegalHoldInput } from "./model";

export interface LegalHoldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** LegalHoldOptions.holdTypes. */
  holdTypes: readonly SelectOption[];
  /** CreateLegalHold; throws with the server's errors. */
  onCreate: (input: LegalHoldInput) => Promise<void>;
}

const EMPTY: LegalHoldInput = {
  name: "",
  description: "",
  referenceNumber: "",
  holdType: "litigation",
  appliesToAll: true,
  entityTypes: [],
  custodianEmail: "",
  effectiveDate: "",
  expirationDate: "",
};

function LegalHoldBody({
  open,
  onOpenChange,
  holdTypes,
  onCreate,
}: LegalHoldDialogProps) {
  const [values, setValues] = React.useState<LegalHoldInput>(() => ({
    ...EMPTY,
    holdType: holdTypes[0]?.value ?? EMPTY.holdType,
  }));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = <K extends keyof LegalHoldInput>(
    key: K,
    value: LegalHoldInput[K],
  ) => setValues({ ...values, [key]: value });
  const nameError = values.name.trim()
    ? null
    : "Name the hold, usually after the matter.";
  const scopeError =
    !values.appliesToAll && values.entityTypes.length === 0
      ? "Pick the data the hold covers."
      : null;
  const dateError =
    values.effectiveDate &&
    values.expirationDate &&
    values.expirationDate < values.effectiveDate
      ? "The hold cannot end before it starts."
      : null;
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (nameError || dateError || scopeError) return;
            setPending(true);
            setError(null);
            try {
              await onCreate({ ...values, name: values.name.trim() });
              onOpenChange(false);
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "The hold was not created.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New legal hold</DialogTitle>
            <DialogDescription>
              Covered data is kept past every retention policy until the hold is
              released.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Name"
              error={values.name ? null : nameError}
              className="sm:col-span-2"
            >
              {(control) => (
                <Input
                  {...control}
                  value={values.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Type">
              {(control) => (
                <Select
                  {...control}
                  options={holdTypes}
                  value={values.holdType}
                  onChange={(e) => set("holdType", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Reference">
              {(control) => (
                <Input
                  {...control}
                  placeholder="Case or matter number"
                  value={values.referenceNumber}
                  onChange={(e) => set("referenceNumber", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Effective from" hint="Empty: from now.">
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={values.effectiveDate}
                  onChange={(e) => set("effectiveDate", e.target.value)}
                />
              )}
            </FormField>
            <FormField
              label="Ends on"
              hint="Empty: until released."
              error={dateError}
            >
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={values.expirationDate}
                  onChange={(e) => set("expirationDate", e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Custodian email" className="sm:col-span-2">
              {(control) => (
                <Input
                  {...control}
                  type="email"
                  value={values.custodianEmail}
                  onChange={(e) => set("custodianEmail", e.target.value)}
                />
              )}
            </FormField>
          </div>
          <SwitchField
            label="All data"
            description="Hold every kind of data for this organization. Turn off to pick the kinds."
            checked={values.appliesToAll}
            onCheckedChange={(appliesToAll) =>
              set("appliesToAll", appliesToAll)
            }
          />
          {!values.appliesToAll && (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-medium">Data held</legend>
              {RETENTION_ENTITY_TYPES.filter((t) => t.value !== "all").map(
                (t) => {
                  const id = `hold-${t.value}`;
                  const checked = values.entityTypes.includes(t.value);
                  return (
                    <div key={t.value} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(next) =>
                          set(
                            "entityTypes",
                            next
                              ? [...values.entityTypes, t.value]
                              : values.entityTypes.filter((v) => v !== t.value),
                          )
                        }
                      />
                      <label htmlFor={id} className="text-sm">
                        {t.label}
                      </label>
                    </div>
                  );
                },
              )}
              {scopeError && (
                <p className="text-xs text-danger sm:col-span-2">
                  {scopeError}
                </p>
              )}
            </fieldset>
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                pending || Boolean(nameError || dateError || scopeError)
              }
            >
              {pending ? "Creating" : "Create hold"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A new legal hold: from its effective date, covered data is kept past any
 * retention policy until the hold is released. The form mounts on open, so
 * each opening starts empty.
 */
export function LegalHoldDialog(props: LegalHoldDialogProps) {
  return props.open ? <LegalHoldBody {...props} /> : null;
}

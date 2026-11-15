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
  Field,
  Input,
  Select,
  type SelectOption,
  Switch,
} from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import { type LegalHoldInput, useSettingsLabels } from "./model";

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
  const t = useTranslations("settings.legalHoldDialog");
  const { RETENTION_ENTITY_TYPES } = useSettingsLabels();
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
  const nameError = values.name.trim() ? null : t("nameTheHoldUsuallyAfter");
  const scopeError =
    !values.appliesToAll && values.entityTypes.length === 0
      ? t("pickTheDataTheHold")
      : null;
  const dateError =
    values.effectiveDate &&
    values.expirationDate &&
    values.expirationDate < values.effectiveDate
      ? t("theHoldCannotEndBefore")
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
                  : t("theHoldWasNotCreated"),
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("newLegalHold")}</DialogTitle>
            <DialogDescription>{t("coveredDataIsKeptPast")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("name")}
              error={values.name ? null : nameError}
              className="sm:col-span-2"
            >
              <Input
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label={t("type")}>
              <Select
                options={holdTypes}
                value={values.holdType}
                onValueChange={(holdType) => set("holdType", holdType)}
                className="w-full"
              />
            </Field>
            <Field label={t("reference")}>
              <Input
                placeholder={t("caseOrMatterNumber")}
                value={values.referenceNumber}
                onChange={(e) => set("referenceNumber", e.target.value)}
              />
            </Field>
            <Field label={t("effectiveFrom")} hint={t("emptyFromNow")}>
              <Input
                type="date"
                value={values.effectiveDate}
                onChange={(e) => set("effectiveDate", e.target.value)}
              />
            </Field>
            <Field
              label={t("endsOn")}
              hint={t("emptyUntilReleased")}
              error={dateError}
            >
              <Input
                type="date"
                value={values.expirationDate}
                onChange={(e) => set("expirationDate", e.target.value)}
              />
            </Field>
            <Field label={t("custodianEmail")} className="sm:col-span-2">
              <Input
                type="email"
                value={values.custodianEmail}
                onChange={(e) => set("custodianEmail", e.target.value)}
              />
            </Field>
          </div>
          <Field
            label={t("allData")}
            hint={t("holdEveryKindOfData")}
            orientation="horizontal"
            className="py-2"
          >
            <Switch
              checked={values.appliesToAll}
              onCheckedChange={(appliesToAll) =>
                set("appliesToAll", appliesToAll)
              }
            />
          </Field>
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
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                pending || Boolean(nameError || dateError || scopeError)
              }
            >
              {pending ? t("creating") : t("createHold")}
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

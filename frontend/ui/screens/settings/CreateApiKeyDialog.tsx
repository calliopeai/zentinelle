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
} from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import { useSettingsLabels } from "./model";

export interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** CreatePlatformAPIKey; throws with the server's `error` when `ok` is false. */
  onCreate: (input: { name: string; scopes: string[] }) => Promise<void>;
}

/** A new platform API key: a name and its scopes. The key itself is shown once, on the page, after this closes. */
export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateApiKeyDialogProps) {
  const t = useTranslations("settings.createApiKeyDialog");
  const { API_KEY_SCOPES } = useSettingsLabels();
  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["read"]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState(false);
  const nameError = name.trim() ? null : t("nameTheKeyAfterWhat");
  const reset = () => {
    setName("");
    setScopes(["read"]);
    setError(null);
    setTouched(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setTouched(true);
            if (nameError || scopes.length === 0) return;
            setPending(true);
            setError(null);
            try {
              await onCreate({ name: name.trim(), scopes });
              reset();
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : t("theKeyWasNotCreated"),
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("newApiKey")}</DialogTitle>
            <DialogDescription>
              {t("forScriptsAndServicesThat")}
            </DialogDescription>
          </DialogHeader>
          <Field label={t("name")} error={touched ? nameError : null}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ci-policy-sync"
              autoFocus
            />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Scopes</legend>
            {API_KEY_SCOPES.map((scope) => {
              const id = `scope-${scope.value}`;
              return (
                <div key={scope.value} className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    checked={scopes.includes(scope.value)}
                    onCheckedChange={(checked) =>
                      setScopes(
                        checked
                          ? [...scopes, scope.value]
                          : scopes.filter((s) => s !== scope.value),
                      )
                    }
                    aria-describedby={`${id}-description`}
                  />
                  <div className="grid">
                    <label htmlFor={id} className="text-sm">
                      {scope.label}
                    </label>
                    <span
                      id={`${id}-description`}
                      className="text-xs text-muted-foreground"
                    >
                      {scope.description}
                    </span>
                  </div>
                </div>
              );
            })}
            {touched && scopes.length === 0 && (
              <p className="text-xs text-danger">Pick at least one scope.</p>
            )}
          </fieldset>
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
            <Button type="submit" disabled={pending}>
              {pending ? t("creating") : t("createKey")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

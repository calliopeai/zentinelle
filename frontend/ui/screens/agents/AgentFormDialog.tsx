import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";
import * as React from "react";

import { SelectField, TextField, TextareaField } from "../../shared/FormField";
import { OneTimeSecret } from "../../shared/OneTimeSecret";
import { useAgentLabels } from "./format";

export interface AgentFormValues {
  name: string;
  agentId: string;
  agentType: string;
  capabilities: string[];
  /** Parsed from the JSON field; null when it is empty. */
  metadata: Record<string, unknown> | null;
}

export interface AgentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Register issues a key; edit cannot change the agent id. */
  mode: "register" | "edit";
  initial?: Partial<AgentFormValues>;
  /**
   * CreateAgentEndpoint or UpdateAgentEndpoint. Resolve with the key the
   * register call returned; reject with the server's message when
   * `success` is false, and the dialog shows it.
   */
  onSubmit: (
    values: AgentFormValues,
  ) => Promise<{ apiKey?: string | null } | void>;
  /** Copies the key; defaults to the clipboard. */
  onCopy?: (value: string) => Promise<void> | void;
}

const SLUG = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** Each value names its message under `agents.form.errors`. */
type Errors = Partial<
  Record<"name" | "agentId" | "agentType" | "metadata", string>
>;

function validate(
  mode: AgentFormDialogProps["mode"],
  form: { name: string; agentId: string; agentType: string; metadata: string },
): Errors {
  const errors: Errors = {};
  if (form.name.trim().length < 2) errors.name = "name";
  if (mode === "register" && !SLUG.test(form.agentId))
    errors.agentId = "agentId";
  if (!form.agentType) errors.agentType = "agentType";
  if (form.metadata.trim()) {
    try {
      const parsed: unknown = JSON.parse(form.metadata);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        errors.metadata = "metadataObject";
    } catch {
      errors.metadata = "metadataJson";
    }
  }
  return errors;
}

/**
 * Register an agent (and show its API key once), or edit one. The fields
 * are CreateAgentEndpointInput's and UpdateAgentEndpointInput's.
 */
function AgentFormDialogContent({
  onOpenChange,
  mode,
  initial,
  onSubmit,
  onCopy,
}: Omit<AgentFormDialogProps, "open">) {
  const t = useTranslations("agents.form");
  const c = useTranslations("common");
  const errorText = (key?: string) => (key ? t(`errors.${key}`) : undefined);
  const { typeOptions } = useAgentLabels();
  const blank = React.useMemo(
    () => ({
      name: initial?.name ?? "",
      agentId: initial?.agentId ?? "",
      agentType: initial?.agentType ?? "",
      capabilities: (initial?.capabilities ?? []).join(", "),
      metadata: initial?.metadata
        ? JSON.stringify(initial.metadata, null, 2)
        : "",
    }),
    [initial],
  );
  const [form, setForm] = React.useState(blank);
  const [errors, setErrors] = React.useState<Errors>({});
  const [failure, setFailure] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [apiKey, setApiKey] = React.useState<string | null>(null);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((old) => ({ ...old, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate(mode, form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    setFailure("");
    try {
      const result = await onSubmit({
        name: form.name.trim(),
        agentId: form.agentId.trim(),
        agentType: form.agentType,
        capabilities: form.capabilities
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        metadata: form.metadata.trim()
          ? (JSON.parse(form.metadata) as Record<string, unknown>)
          : null,
      });
      if (result && result.apiKey) setApiKey(result.apiKey);
      else onOpenChange(false);
    } catch (error) {
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : mode === "register"
            ? t("notRegistered")
            : t("notSaved"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogContent
      className="sm:max-w-lg"
      hideCloseButton={pending}
      onEscapeKeyDown={(e) => pending && e.preventDefault()}
      onInteractOutside={(e) => pending && e.preventDefault()}
    >
      {apiKey ? (
        <>
          <DialogHeader>
            <DialogTitle>{t("keyTitle", { name: form.name })}</DialogTitle>
            <DialogDescription>{t("keyDescription")}</DialogDescription>
          </DialogHeader>
          <OneTimeSecret
            label={t("keyLabel", { name: form.name })}
            value={apiKey}
            onCopy={onCopy}
          />
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{c("done")}</Button>
          </DialogFooter>
        </>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          className="flex min-w-0 flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>
              {mode === "register"
                ? t("registerTitle")
                : t("editTitle", { name: blank.name })}
            </DialogTitle>
            <DialogDescription>
              {mode === "register"
                ? t("registerDescription")
                : t("editDescription")}
            </DialogDescription>
          </DialogHeader>
          <TextField
            label={t("name")}
            required
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            error={errorText(errors.name)}
            maxLength={255}
            autoComplete="off"
          />
          {mode === "register" ? (
            <TextField
              label={t("agentId")}
              required
              value={form.agentId}
              onChange={(e) => set("agentId")(e.target.value)}
              error={errorText(errors.agentId)}
              hint={t("agentIdHint")}
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
            />
          ) : (
            <TextField
              label={t("agentId")}
              value={form.agentId}
              readOnly
              disabled
            />
          )}
          <SelectField
            label={t("type")}
            required
            value={form.agentType}
            onChange={(e) => set("agentType")(e.target.value)}
            options={typeOptions}
            placeholder={t("typePlaceholder")}
            error={errorText(errors.agentType)}
          />
          <TextField
            label={t("capabilities")}
            value={form.capabilities}
            onChange={(e) => set("capabilities")(e.target.value)}
            hint={t("capabilitiesHint")}
            autoComplete="off"
          />
          <TextareaField
            label={t("metadata")}
            value={form.metadata}
            onChange={(e) => set("metadata")(e.target.value)}
            error={errorText(errors.metadata)}
            hint={t("metadataHint")}
            spellCheck={false}
            rows={4}
          />
          {failure && (
            <p
              role="alert"
              className="text-danger-fg text-sm [overflow-wrap:anywhere]"
            >
              {failure}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {c("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? c("saving")
                : mode === "register"
                  ? t("submitRegister")
                  : c("saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}

/** The dialog; its form state starts fresh each time it opens. */
export function AgentFormDialog({ open, ...props }: AgentFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      {open && <AgentFormDialogContent {...props} />}
    </Dialog>
  );
}

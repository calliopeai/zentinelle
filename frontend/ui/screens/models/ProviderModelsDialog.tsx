"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Input,
  LoadingState,
} from "@calliopelabs/ui";
import * as React from "react";

import { formatTokens } from "../../shared/figures";
import type { ProviderModel } from "./providers";

export interface ProviderModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerLabel: string;
  /** `GET /assistant/models?provider=`; null while loading. */
  models: readonly ProviderModel[] | null;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** `POST /assistant/models/bulk` with the enabled model ids. Resolve to close; reject to show the message. */
  onSave: (enabledModelIds: string[]) => Promise<unknown> | unknown;
  locale?: string;
}

/**
 * Which of a provider's models the assistant's picker offers. Hiding a model
 * removes it from the picker only; policies, history and keys are untouched.
 * Mount it with a `key` per provider, so the choices start from the server's.
 */
export function ProviderModelsDialog({
  open,
  onOpenChange,
  providerLabel,
  models,
  error,
  onRetry,
  onSave,
  locale = "en",
}: ProviderModelsDialogProps) {
  const [enabled, setEnabled] = React.useState<Set<string> | null>(null);
  const [filter, setFilter] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const searchId = React.useId();

  const current =
    enabled ??
    new Set(
      (models ?? []).filter((m) => m.enabled_for_chat).map((m) => m.model_id),
    );
  const shown = (models ?? []).filter((m) => {
    const f = filter.trim().toLowerCase();
    return (
      !f ||
      m.name.toLowerCase().includes(f) ||
      m.model_id.toLowerCase().includes(f)
    );
  });
  const toggle = (id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setEnabled(next);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{providerLabel} models in the assistant</DialogTitle>
          <DialogDescription>
            Choose which models the assistant offers. Hidden models keep their
            policies and history.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <ErrorState
            title="Could not load models"
            error={error}
            onRetry={onRetry}
          />
        ) : !models ? (
          <LoadingState label="Loading models" rows={4} />
        ) : models.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            The registry has no {providerLabel} models yet.
          </p>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={searchId} className="sr-only">
                Filter models
              </label>
              <Input
                id={searchId}
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter models"
                className="min-w-48 flex-1"
              />
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {current.size} of {models.length} on
              </span>
            </div>
            <fieldset className="max-h-72 overflow-y-auto rounded-lg border">
              <legend className="sr-only">Models</legend>
              {shown.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No models match the filter.
                </p>
              ) : (
                shown.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-0 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={current.has(m.model_id)}
                      onChange={() => toggle(m.model_id)}
                      className="accent-primary"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm [overflow-wrap:anywhere]">
                        {m.name}
                        {m.deprecated && (
                          <span className="ml-2 text-2xs text-muted-foreground">
                            deprecated
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-2xs text-muted-foreground [overflow-wrap:anywhere]">
                        {m.model_id}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                      {formatTokens(m.context_window, locale)}
                    </span>
                  </label>
                ))
              )}
            </fieldset>
          </div>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-danger-fg">
            {saveError}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={saving || !models || models.length === 0}
            onClick={async () => {
              setSaving(true);
              setSaveError(null);
              try {
                await onSave([...current]);
                onOpenChange(false);
              } catch (err) {
                setSaveError(
                  err instanceof Error ? err.message : "Could not save.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

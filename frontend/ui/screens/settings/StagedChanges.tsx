"use client";

import { Button, List, ListItem, Section, StatusBadge } from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import {
  CHANGE_TONE,
  NEXT_TRANSITIONS,
  type RuntimeChange,
  type RuntimeActions,
  useSettingsLabels,
} from "./model";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface StagedChangesProps {
  changes: readonly RuntimeChange[];
  onTransition: RuntimeActions["onTransition"];
}

const VERB = (t: Translate) =>
  ({
    approved: t("approve"),
    applied: t("apply"),
    rejected: t("reject"),
  }) as const;

/**
 * Runtime changes waiting on a person: staged, then approved, then applied
 * (RuntimeSettingsChange). Nothing takes effect until it is applied.
 */
export function StagedChanges({ changes, onTransition }: StagedChangesProps) {
  const t = useTranslations("settings.stagedChanges");
  const { formatDate } = useSettingsLabels();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const act = async (
    change: RuntimeChange,
    status: keyof ReturnType<typeof VERB>,
  ) => {
    setBusy(change.id);
    setError(null);
    try {
      await onTransition(change, status);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t("couldNot", { verb: VERB(t)[status].toLowerCase() }),
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <Section
      title={t("waitingForApproval")}
      description={t("aStagedChangeTakesEffect")}
      headingLevel="h3"
    >
      {error && (
        <p role="alert" className="mb-2 text-xs text-danger">
          {error}
        </p>
      )}
      <List
        label={t("stagedRuntimeChanges")}
        items={changes}
        getKey={(change) => change.id}
        empty={{
          title: t("nothingIsWaiting"),
          description: t("stagedChangesAppearHereUntil"),
        }}
        renderItem={(change) => (
          <ListItem
            title={Object.keys(change.settings).join(", ") || t("noSettings")}
            description={
              change.approved_by
                ? t("stagedApproved", {
                    by: change.created_by,
                    on: formatDate(change.created_at),
                    revision: change.base_revision,
                    approver: change.approved_by,
                  })
                : t("staged", {
                    by: change.created_by,
                    on: formatDate(change.created_at),
                    revision: change.base_revision,
                  })
            }
            status={
              <StatusBadge tone={CHANGE_TONE[change.status]}>
                {change.status.replace("_", " ")}
              </StatusBadge>
            }
            actions={
              <div className="flex gap-2">
                {NEXT_TRANSITIONS[change.status].map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={status === "rejected" ? "ghost" : "outline"}
                    disabled={busy === change.id}
                    onClick={() => void act(change, status)}
                    aria-label={t("actOn", {
                      verb: VERB(t)[status],
                      keys: Object.keys(change.settings).join(", "),
                    })}
                  >
                    {VERB(t)[status]}
                  </Button>
                ))}
              </div>
            }
          />
        )}
      />
    </Section>
  );
}

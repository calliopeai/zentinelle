"use client";

import { Button, List, ListItem, Section, StatusBadge } from "@calliopelabs/ui";
import * as React from "react";

import {
  CHANGE_TONE,
  NEXT_TRANSITIONS,
  formatDate,
  type RuntimeChange,
  type RuntimeActions,
} from "./model";

export interface StagedChangesProps {
  changes: readonly RuntimeChange[];
  onTransition: RuntimeActions["onTransition"];
}

const VERB = {
  approved: "Approve",
  applied: "Apply",
  rejected: "Reject",
} as const;

/**
 * Runtime changes waiting on a person: staged, then approved, then applied
 * (RuntimeSettingsChange). Nothing takes effect until it is applied.
 */
export function StagedChanges({ changes, onTransition }: StagedChangesProps) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const act = async (change: RuntimeChange, status: keyof typeof VERB) => {
    setBusy(change.id);
    setError(null);
    try {
      await onTransition(change, status);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : `Could not ${VERB[status].toLowerCase()} the change.`,
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <Section
      title="Waiting for approval"
      description="A staged change takes effect only when it is approved and then applied."
      headingLevel="h3"
    >
      {error && (
        <p role="alert" className="mb-2 text-xs text-danger">
          {error}
        </p>
      )}
      <List
        label="Staged runtime changes"
        items={changes}
        getKey={(change) => change.id}
        empty={{
          title: "Nothing is waiting",
          description:
            "Staged changes appear here until they are applied or rejected.",
        }}
        renderItem={(change) => (
          <ListItem
            title={Object.keys(change.settings).join(", ") || "No settings"}
            description={`Staged by ${change.created_by} on ${formatDate(change.created_at)}, from revision ${change.base_revision}${change.approved_by ? `; approved by ${change.approved_by}` : ""}`}
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
                    aria-label={`${VERB[status]} the change to ${Object.keys(change.settings).join(", ")}`}
                  >
                    {VERB[status]}
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

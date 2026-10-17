"use client";

import {
  Button,
  ConfirmDialog,
  List,
  ListItem,
  Section,
  StatusBadge,
} from "@calliopelabs/ui";
import * as React from "react";

import { formatDate, type RuntimeActions, type RuntimeRevision } from "./model";

export interface RevisionHistoryProps {
  revisions: readonly RuntimeRevision[];
  /** The revision in effect; every other one can be rolled back to. */
  current: number;
  onRollback: RuntimeActions["onRollback"];
}

/** The last twenty applied revisions of the runtime settings, newest first, each one a rollback target. */
export function RevisionHistory({
  revisions,
  current,
  onRollback,
}: RevisionHistoryProps) {
  const [target, setTarget] = React.useState<number | null>(null);
  return (
    <Section
      title="Revisions"
      description="Rolling back applies an earlier revision as a new one."
      headingLevel="h3"
    >
      <List
        label="Runtime revisions"
        items={revisions}
        getKey={(r) => String(r.revision)}
        empty={{
          title: "No revisions yet",
          description: "Every value is still the default.",
        }}
        renderItem={(r) => (
          <ListItem
            title={`Revision ${r.revision}`}
            description={`${r.actor_name || r.actor_id || "system"}, ${formatDate(r.created_at)}`}
            status={
              r.revision === current ? (
                <StatusBadge tone="ok">in effect</StatusBadge>
              ) : undefined
            }
            actions={
              r.revision === current ? undefined : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Roll back to revision ${r.revision}`}
                  onClick={() => setTarget(r.revision)}
                >
                  Roll back
                </Button>
              )
            }
          />
        )}
      />
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Roll back to revision ${target}?`}
        description={`The values of revision ${target} become revision ${current + 1}, in effect at once for every agent and the assistant. Revision ${current} stays in this list.`}
        confirmLabel="Roll back"
        onConfirm={() =>
          target === null ? undefined : onRollback(target, current)
        }
      />
    </Section>
  );
}

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
import { useTranslations } from "next-intl";

import {
  type RuntimeActions,
  type RuntimeRevision,
  useSettingsLabels,
} from "./model";

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
  const t = useTranslations("settings.revisionHistory");
  const { formatDate } = useSettingsLabels();
  const [target, setTarget] = React.useState<number | null>(null);
  return (
    <Section
      title={t("revisions")}
      description={t("rollingBackAppliesAnEarlier")}
      headingLevel="h3"
    >
      <List
        label={t("runtimeRevisions")}
        items={revisions}
        getKey={(r) => String(r.revision)}
        empty={{
          title: t("noRevisionsYet"),
          description: t("everyValueIsStillThe"),
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
                  aria-label={t("rollBackTo", { revision: r.revision })}
                  onClick={() => setTarget(r.revision)}
                >
                  {t("rollBack")}
                </Button>
              )
            }
          />
        )}
      />
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={t("rollBackTitle", { revision: target ?? "" })}
        description={t("rollBackDescription", {
          target: target ?? "",
          next: current + 1,
          current,
        })}
        confirmLabel={t("rollBack")}
        onConfirm={() =>
          target === null ? undefined : onRollback(target, current)
        }
      />
    </Section>
  );
}

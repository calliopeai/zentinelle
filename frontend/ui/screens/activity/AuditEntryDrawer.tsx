import {
  DefinitionList,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  StatusBadge,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import type { AuditLogData } from "@/graphql/events/types";

import { formatDateTime } from "../../shared/format";
import { JsonBlock } from "./JsonBlock";
import { AUDIT_STATUS_TONE, toneOf, useActivityLabels } from "./tones";

export interface AuditEntryDrawerProps {
  /** The record on show; null closes the drawer. */
  entry: AuditLogData | null;
  onClose: () => void;
}

/** Who acted, by what credential; `t` is the `activity.audit` translator. */
export function actorLabel(
  entry: Pick<AuditLogData, "actor" | "apiKeyPrefix">,
  t: (key: string, values?: Record<string, string>) => string,
) {
  const a = entry.actor;
  if (a?.name || a?.email) return a.name ?? a.email ?? "";
  if (entry.apiKeyPrefix)
    return t("actor.apiKey", { prefix: entry.apiKeyPrefix });
  return a?.type ?? t("actor.system");
}

/** One audit record: who did what to which resource, from where, and the fields it changed. */
export function AuditEntryDrawer({ entry, onClose }: AuditEntryDrawerProps) {
  const t = useTranslations("activity.audit");
  const labels = useActivityLabels();
  return (
    <Drawer open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="sm:max-w-lg">
        {entry && (
          <>
            <DrawerHeader>
              {entry.status && (
                <div className="pr-6">
                  <StatusBadge tone={toneOf(AUDIT_STATUS_TONE, entry.status)}>
                    {labels.auditStatus(entry.status)}
                  </StatusBadge>
                </div>
              )}
              <DrawerTitle className="font-mono break-words">
                {entry.action}
              </DrawerTitle>
              <DrawerDescription className="break-words">
                {t("drawer.description", {
                  actor: actorLabel(entry, t),
                  resource: entry.resourceName || entry.resourceType,
                })}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-4 px-4 pb-4">
              <DefinitionList
                columns={1}
                items={[
                  {
                    term: t("drawer.when"),
                    description: formatDateTime(entry.timestamp),
                  },
                  {
                    term: t("drawer.actor"),
                    description: actorLabel(entry, t) || null,
                  },
                  {
                    term: t("drawer.email"),
                    description: entry.actor?.email || null,
                  },
                  {
                    term: t("drawer.resource"),
                    description: (
                      <span className="font-mono text-xs">{`${entry.resourceType} ${entry.resourceId}`}</span>
                    ),
                  },
                  {
                    term: t("drawer.ip"),
                    description: entry.ipAddress ? (
                      <span className="font-mono text-xs">
                        {entry.ipAddress}
                      </span>
                    ) : null,
                  },
                  {
                    term: t("drawer.userAgent"),
                    description: entry.userAgent ? (
                      <span className="font-mono text-xs">
                        {entry.userAgent}
                      </span>
                    ) : null,
                  },
                ]}
              />
              {entry.changes && entry.changes.length > 0 && (
                <table className="w-full text-left text-sm">
                  <caption className="mb-1 text-left text-xs text-muted-foreground">
                    {t("drawer.changes")}
                  </caption>
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-1 font-normal">
                        {t("drawer.field")}
                      </th>
                      <th scope="col" className="py-1 font-normal">
                        {t("drawer.before")}
                      </th>
                      <th scope="col" className="py-1 font-normal">
                        {t("drawer.after")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.changes.map((c, i) => (
                      <tr
                        key={`${c.field}-${i}`}
                        className="border-t border-border align-top"
                      >
                        <td className="py-1.5 pr-2 font-mono text-xs">
                          {c.field ?? "–"}
                        </td>
                        <td className="py-1.5 pr-2 break-words">
                          {c.oldValue ?? "–"}
                        </td>
                        <td className="py-1.5 break-words">
                          {c.newValue ?? "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {entry.details && (
                <JsonBlock label={t("drawer.details")} value={entry.details} />
              )}
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

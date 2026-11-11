import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  StatusBadge,
} from "@calliopelabs/ui";

import type { AuditLogData } from "@/graphql/events/types";

import { DefinitionList } from "./components/DefinitionList";
import { formatDateTime } from "../../shared/format";
import { JsonBlock } from "./JsonBlock";
import { AUDIT_STATUS_TONE, toneOf } from "./tones";

export interface AuditEntryDrawerProps {
  /** The record on show; null closes the drawer. */
  entry: AuditLogData | null;
  onClose: () => void;
}

/** Who acted, by what credential. */
export function actorLabel(
  entry: Pick<AuditLogData, "actor" | "apiKeyPrefix">,
) {
  const a = entry.actor;
  if (a?.name || a?.email) return a.name ?? a.email ?? "";
  if (entry.apiKeyPrefix) return `API key ${entry.apiKeyPrefix}`;
  return a?.type ?? "System";
}

/** One audit record: who did what to which resource, from where, and the fields it changed. */
export function AuditEntryDrawer({ entry, onClose }: AuditEntryDrawerProps) {
  return (
    <Drawer open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="sm:max-w-lg">
        {entry && (
          <>
            <DrawerHeader>
              {entry.status && (
                <div className="pr-6">
                  <StatusBadge tone={toneOf(AUDIT_STATUS_TONE, entry.status)}>
                    {entry.status}
                  </StatusBadge>
                </div>
              )}
              <DrawerTitle className="font-mono break-words">
                {entry.action}
              </DrawerTitle>
              <DrawerDescription className="break-words">
                {actorLabel(entry)} on{" "}
                {entry.resourceName || entry.resourceType}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-4 px-4 pb-4">
              <DefinitionList
                columns={1}
                items={[
                  { term: "When", value: formatDateTime(entry.timestamp) },
                  { term: "Actor", value: actorLabel(entry) },
                  { term: "Actor email", value: entry.actor?.email },
                  {
                    term: "Resource",
                    value: `${entry.resourceType} ${entry.resourceId}`,
                    mono: true,
                  },
                  { term: "IP address", value: entry.ipAddress, mono: true },
                  { term: "User agent", value: entry.userAgent, mono: true },
                ]}
              />
              {entry.changes && entry.changes.length > 0 && (
                <table className="w-full text-left text-sm">
                  <caption className="mb-1 text-left text-xs text-muted-foreground">
                    Changes
                  </caption>
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-1 font-normal">
                        Field
                      </th>
                      <th scope="col" className="py-1 font-normal">
                        Before
                      </th>
                      <th scope="col" className="py-1 font-normal">
                        After
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
                <JsonBlock label="Details" value={entry.details} />
              )}
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

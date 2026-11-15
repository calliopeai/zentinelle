import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  StatusBadge,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import type { EventData } from "@/graphql/events/types";

import { DefinitionList } from "./components/DefinitionList";
import { formatDateTime } from "../../shared/format";
import { JsonBlock } from "./JsonBlock";
import { EVENT_STATUS_TONE, toneOf, useActivityLabels } from "./tones";

export interface EventDrawerProps {
  /** The event on show; null closes the drawer. */
  event: EventData | null;
  onClose: () => void;
}

/** One event in a side sheet, payload included. */
export function EventDrawer({ event, onClose }: EventDrawerProps) {
  const t = useTranslations("activity.events.drawer");
  const labels = useActivityLabels();
  return (
    <Drawer open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="sm:max-w-lg">
        {event && (
          <>
            <DrawerHeader>
              <div className="pr-6">
                <StatusBadge tone={toneOf(EVENT_STATUS_TONE, event.status)}>
                  {labels.eventStatus(event.status)}
                </StatusBadge>
              </div>
              <DrawerTitle className="break-words">
                {labels.eventType(event.eventType)}
              </DrawerTitle>
              <DrawerDescription>
                {t("description", {
                  category: labels.eventCategory(event.eventCategory),
                  agent: event.endpointName ?? t("unknownAgent"),
                })}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-4 px-4 pb-4">
              <DefinitionList
                columns={1}
                items={[
                  {
                    term: t("occurred"),
                    value: formatDateTime(event.occurredAt),
                  },
                  {
                    term: t("processed"),
                    value: event.processedAt
                      ? formatDateTime(event.processedAt)
                      : t("notYet"),
                  },
                  { term: t("user"), value: event.userIdentifier, mono: true },
                  {
                    term: t("correlation"),
                    value: event.correlationId,
                    mono: true,
                  },
                  { term: t("id"), value: event.id, mono: true },
                ]}
              />
              <JsonBlock label={t("payload")} value={event.payload} />
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

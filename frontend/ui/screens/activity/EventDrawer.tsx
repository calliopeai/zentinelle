import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  StatusBadge,
} from "@calliopelabs/ui";

import type { EventData } from "@/graphql/events/types";

import { DefinitionList } from "../../shared/DefinitionList";
import { formatDateTime, humanize } from "../../shared/format";
import { JsonBlock } from "./JsonBlock";
import { EVENT_STATUS_TONE, toneOf } from "./tones";

export interface EventDrawerProps {
  /** The event on show; null closes the drawer. */
  event: EventData | null;
  onClose: () => void;
}

/** One event in a side sheet, payload included. */
export function EventDrawer({ event, onClose }: EventDrawerProps) {
  return (
    <Drawer open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="sm:max-w-lg">
        {event && (
          <>
            <DrawerHeader>
              <div className="pr-6">
                <StatusBadge tone={toneOf(EVENT_STATUS_TONE, event.status)}>
                  {event.status}
                </StatusBadge>
              </div>
              <DrawerTitle className="break-words">
                {humanize(event.eventType)}
              </DrawerTitle>
              <DrawerDescription>
                {humanize(event.eventCategory)} event from{" "}
                {event.endpointName ?? "an unknown agent"}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-4 px-4 pb-4">
              <DefinitionList
                columns={1}
                items={[
                  { term: "Occurred", value: formatDateTime(event.occurredAt) },
                  {
                    term: "Processed",
                    value: event.processedAt
                      ? formatDateTime(event.processedAt)
                      : "Not yet",
                  },
                  { term: "User", value: event.userIdentifier, mono: true },
                  {
                    term: "Correlation id",
                    value: event.correlationId,
                    mono: true,
                  },
                  { term: "Event id", value: event.id, mono: true },
                ]}
              />
              <JsonBlock label="Payload" value={event.payload} />
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

"use client";

import { useEventsData } from "./data";
import { EventsScreen } from "./EventsScreen";

/** Events on `GetEvents`, polled every 5 seconds with held rows (`useEventsData`). `app/(app)/events` renders this. */
export function EventsConnected() {
  return <EventsScreen {...useEventsData()} />;
}

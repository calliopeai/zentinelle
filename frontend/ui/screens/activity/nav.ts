/** The Activity area's first crumb: the area, switching between its four functions (from the nav model). */
import { areaSwitcher } from "@calliopelabs/ui";

import { ZENTINELLE_NAV } from "../../product";

export type ActivityFunction = "alerts" | "incidents" | "events" | "audit-log";

export function activityCrumb(fn: ActivityFunction) {
  return areaSwitcher(ZENTINELLE_NAV, "activity", fn);
}

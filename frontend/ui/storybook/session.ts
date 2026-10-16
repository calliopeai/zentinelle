/** The signed-in person and the languages the story shells use. */
import { locales } from "@/i18n/config";
import en from "@/messages/en.json";

import { ROLE_CAPABILITIES, type Role } from "../product";

export const STORY_USER = { name: "Leo Mata", email: "leo@calliope.ai" };

/** The app's locales (i18n/config.ts), named as messages/en.json names them. */
export const STORY_LOCALES = locales.map((value) => ({
  value,
  label: en.language[value],
}));

export function capabilitiesOf(role: Role): readonly string[] {
  return ROLE_CAPABILITIES[role];
}

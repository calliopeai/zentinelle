/** The signed-in person and the languages the story shells use. */
import { locales, pickerLocales } from "@/i18n/config";
import en from "@/messages/en.json";

import { ROLE_CAPABILITIES, type Role } from "../product";

export const STORY_USER = { name: "Leo Mata", email: "leo@calliope.ai" };

/** The picker's locales (i18n/config.ts), named as messages/en.json names them. */
export const STORY_LOCALES = pickerLocales.map((value) => ({
  value,
  label: en.language[value],
}));

/**
 * Every locale with a catalog, for stories that show a choice between
 * languages: the picker offers more of them as their catalogs complete.
 */
export const CATALOG_LOCALES = locales.map((value) => ({
  value,
  label: en.language[value],
}));

export function capabilitiesOf(role: Role): readonly string[] {
  return ROLE_CAPABILITIES[role];
}

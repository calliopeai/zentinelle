export const locales = ["en", "pl", "es", "fr", "de", "it", "pt"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/**
 * The locales the language picker offers: those whose catalog has every key
 * `en` has (i18n/messages.test.ts checks). Any other locale still renders,
 * with `en` filling its gaps, but nobody can pick it until it is complete.
 */
export const pickerLocales: readonly Locale[] = ["en"];

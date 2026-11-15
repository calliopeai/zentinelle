import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, locales, type Locale } from "./config";
import { deepMerge } from "./merge";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("locale")?.value;
  const locale: Locale = locales.includes(raw as Locale)
    ? (raw as Locale)
    : defaultLocale;

  // `en` is the complete catalog; any key a locale has not translated yet
  // falls back to it rather than rendering the key.
  const en = (await import("../messages/en.json")).default;
  const messages =
    locale === defaultLocale
      ? en
      : deepMerge(en, (await import(`../messages/${locale}.json`)).default);

  return { locale, messages };
});

/**
 * Number, money and date formatting for the console. One place, so a figure
 * reads the same on every screen. `locale` is the interface language; the
 * default keeps stories and tests deterministic.
 */
export const NOT_REPORTED = "Not reported";

export function formatCount(value: number | null | undefined, locale = "en") {
  if (value == null) return NOT_REPORTED;
  return new Intl.NumberFormat(locale).format(value);
}

/** 18,240 as "18.2K": for tiles and chart axes, never for tables. */
export function formatCompact(value: number | null | undefined, locale = "en") {
  if (value == null) return NOT_REPORTED;
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** US dollars. Small amounts keep four places, as metering records them. */
export function formatUsd(value: number | null | undefined, locale = "en") {
  if (value == null) return NOT_REPORTED;
  const small = value !== 0 && Math.abs(value) < 1;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: small ? 4 : 2,
    maximumFractionDigits: small ? 4 : 2,
  }).format(value);
}

/** A registry price, per million tokens. */
export function formatPerMillion(
  value: number | null | undefined,
  locale = "en",
) {
  if (value == null) return NOT_REPORTED;
  return `${formatUsd(value, locale)} / 1M`;
}

export function formatMs(value: number | null | undefined, locale = "en") {
  if (value == null) return NOT_REPORTED;
  return `${formatCount(Math.round(value), locale)} ms`;
}

/** A context window: 200000 as "200K tokens". */
export function formatTokens(value: number | null | undefined, locale = "en") {
  if (value == null) return NOT_REPORTED;
  return `${formatCompact(value, locale)} tokens`;
}

/** A day on a chart axis or in a list: "Oct 16". Read in UTC, as the server buckets. */
export function formatDay(iso: string | null | undefined, locale = "en") {
  if (!iso) return NOT_REPORTED;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** A moment: "Oct 16, 14:02 UTC". */
export function formatMoment(iso: string | null | undefined, locale = "en") {
  if (!iso) return NOT_REPORTED;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

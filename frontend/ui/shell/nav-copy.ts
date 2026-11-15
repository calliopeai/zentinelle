"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

/** What the shell translates: the model's areas, groups and functions, and the interim tabs. */
export type NavCopyKind = "area" | "group" | "function" | "tab";

export type NavTranslate = (
  kind: NavCopyKind,
  key: string,
  fallback: string,
) => string;

const SECTION: Partial<Record<NavCopyKind, string>> = {
  area: "areas",
  function: "functions",
  tab: "tabs",
};

/**
 * The navigation's labels from `shell.nav` of the message catalog, keyed by
 * the model's own keys (`ui/product.ts` keeps its English labels as the
 * stable defaults). Groups carry no labels in this model; a key the catalog
 * lacks keeps the model's label.
 */
export function useNavCopy(): NavTranslate {
  const t = useTranslations("shell.nav");
  return React.useCallback<NavTranslate>(
    (kind, key, fallback) => {
      const section = SECTION[kind];
      if (!section) return fallback;
      const id = `${section}.${key}`;
      return t.has(id) ? t(id) : fallback;
    },
    [t],
  );
}

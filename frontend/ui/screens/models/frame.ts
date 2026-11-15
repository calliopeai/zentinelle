/**
 * The Models & usage area's frame: the crumb switcher and tab rows, from the
 * navigation model (ui-overhaul-ia §4.1), so the sidebar, the crumb and the
 * tabs always agree.
 */
import { areaSwitcher, type Crumb, type TabNavItem } from "@calliopelabs/ui";

import { useTranslations } from "next-intl";

import { navFor } from "../../product";

export type ModelsFunction = "usage" | "models" | "providers";

export const can = (capabilities: readonly string[], capability: string) =>
  capabilities.includes(capability);

export function areaCrumbs(
  capabilities: readonly string[],
  fn: ModelsFunction,
): Crumb[] {
  return [areaSwitcher(navFor(capabilities), "models", fn)];
}

export type UsageTab = "overview" | "budgets" | "anomalies";

const USAGE_TABS: readonly { key: UsageTab; href: string }[] = [
  { key: "overview", href: "/usage" },
  { key: "budgets", href: "/usage/budgets" },
  { key: "anomalies", href: "/usage/anomalies" },
];

/** Names a tab by its key (`models.labels.tabs`). */
type Name = (key: string) => string;

export function usageTabs(active: UsageTab, name: Name): TabNavItem[] {
  return USAGE_TABS.map((tab) => ({
    ...tab,
    label: name(tab.key),
    active: tab.key === active,
  }));
}

export type ModelsTab = "models" | "routes";

/** Models, plus Route check for admins. One tab is no tab row. */
export function modelsTabs(
  active: ModelsTab,
  capabilities: readonly string[],
  name: Name,
): TabNavItem[] | undefined {
  if (!can(capabilities, "admin")) return undefined;
  return [
    {
      key: "models",
      label: name("models"),
      href: "/models",
      active: active === "models",
    },
    {
      key: "routes",
      label: name("routes"),
      href: "/models/routes",
      active: active === "routes",
    },
  ];
}

/** The area's tab rows, named under `models.labels.tabs`. */
export function useModelsFrame() {
  const t = useTranslations("models.labels");
  const name = (key: string) => t(`tabs.${key}`);
  return {
    usageTabs: (active: UsageTab) => usageTabs(active, name),
    modelsTabs: (active: ModelsTab, capabilities: readonly string[]) =>
      modelsTabs(active, capabilities, name),
  };
}

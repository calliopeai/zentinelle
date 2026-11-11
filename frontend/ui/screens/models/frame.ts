/**
 * The Models & usage area's frame: the crumb switcher and tab rows, from the
 * navigation model (ui-overhaul-ia §4.1), so the sidebar, the crumb and the
 * tabs always agree.
 */
import { areaSwitcher, type Crumb, type TabNavItem } from "@calliopelabs/ui";

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

const USAGE_TABS: readonly { key: UsageTab; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/usage" },
  { key: "budgets", label: "Budgets", href: "/usage/budgets" },
  { key: "anomalies", label: "Anomalies", href: "/usage/anomalies" },
];

export function usageTabs(active: UsageTab): TabNavItem[] {
  return USAGE_TABS.map((t) => ({ ...t, active: t.key === active }));
}

export type ModelsTab = "models" | "routes";

/** Models, plus Route check for admins. One tab is no tab row. */
export function modelsTabs(
  active: ModelsTab,
  capabilities: readonly string[],
): TabNavItem[] | undefined {
  if (!can(capabilities, "admin")) return undefined;
  return [
    {
      key: "models",
      label: "Models",
      href: "/models",
      active: active === "models",
    },
    {
      key: "routes",
      label: "Route check",
      href: "/models/routes",
      active: active === "routes",
    },
  ];
}

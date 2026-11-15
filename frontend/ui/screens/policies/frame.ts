/** The header pieces every Policies screen shares: the crumb switcher and the tab rows of §4.1. */
import { areaSwitcher, type Crumb, type TabNavItem } from "@calliopelabs/ui";

import { navFor } from "../../product";

export type WorkspaceTab = "all" | "hierarchy" | "effective" | "changes";

const WORKSPACE_TABS: readonly { key: WorkspaceTab; href: string }[] = [
  { key: "all", href: "/policies" },
  { key: "hierarchy", href: "/policies/hierarchy" },
  { key: "effective", href: "/policies/effective" },
  { key: "changes", href: "/policies/changes" },
];

/** Names a tab by its key (`usePolicyLabels().tabs`). */
type Name = (key: string) => string;

/** The first crumb: the area's functions, so Policies, Content rules and Prompt library switch in place. */
export function areaCrumb(
  capabilities: readonly string[],
  fn: "policies" | "content-rules" | "prompts",
  href?: string,
): Crumb {
  return {
    ...areaSwitcher(navFor(capabilities), "policies", fn),
    ...(href ? { href } : {}),
  };
}

export function workspaceTabs(active: WorkspaceTab, name: Name): TabNavItem[] {
  return WORKSPACE_TABS.map((tab) => ({
    ...tab,
    label: name(tab.key),
    active: tab.key === active,
  }));
}

export type RulesTab = "rules" | "detections";

export function rulesTabs(active: RulesTab, name: Name): TabNavItem[] {
  return [
    {
      key: "rules",
      label: name("rules"),
      href: "/content-rules",
      active: active === "rules",
    },
    {
      key: "detections",
      label: name("detections"),
      href: "/content-rules/detections",
      active: active === "detections",
    },
  ];
}

export type PolicyTab = "overview" | "configuration" | "scope" | "history";

export function policyTabs(
  id: string,
  active: PolicyTab,
  name: Name,
): TabNavItem[] {
  const base = `/policies/${encodeURIComponent(id)}`;
  return (
    [
      ["overview", base],
      ["configuration", `${base}?tab=configuration`],
      ["scope", `${base}?tab=scope`],
      ["history", `${base}?tab=history`],
    ] as const
  ).map(([key, href]) => ({
    key,
    label: name(key),
    href,
    active: key === active,
  }));
}

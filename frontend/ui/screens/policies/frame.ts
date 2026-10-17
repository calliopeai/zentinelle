/** The header pieces every Policies screen shares: the crumb switcher and the tab rows of §4.1. */
import { areaSwitcher, type Crumb, type TabNavItem } from "@calliopelabs/ui";

import { navFor } from "../../product";

export type WorkspaceTab = "all" | "hierarchy" | "effective" | "changes";

const WORKSPACE_TABS: readonly {
  key: WorkspaceTab;
  label: string;
  href: string;
}[] = [
  { key: "all", label: "All", href: "/policies" },
  { key: "hierarchy", label: "Hierarchy", href: "/policies/hierarchy" },
  { key: "effective", label: "Effective", href: "/policies/effective" },
  { key: "changes", label: "Changes", href: "/policies/changes" },
];

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

export function workspaceTabs(active: WorkspaceTab): TabNavItem[] {
  return WORKSPACE_TABS.map((tab) => ({ ...tab, active: tab.key === active }));
}

export type RulesTab = "rules" | "detections";

export function rulesTabs(active: RulesTab): TabNavItem[] {
  return [
    {
      key: "rules",
      label: "Rules",
      href: "/content-rules",
      active: active === "rules",
    },
    {
      key: "detections",
      label: "Detections",
      href: "/content-rules/detections",
      active: active === "detections",
    },
  ];
}

export type PolicyTab = "overview" | "configuration" | "scope" | "history";

export function policyTabs(id: string, active: PolicyTab): TabNavItem[] {
  const base = `/policies/${encodeURIComponent(id)}`;
  return (
    [
      ["overview", "Overview", base],
      ["configuration", "Configuration", `${base}?tab=configuration`],
      ["scope", "Scope and effect", `${base}?tab=scope`],
      ["history", "History", `${base}?tab=history`],
    ] as const
  ).map(([key, label, href]) => ({ key, label, href, active: key === active }));
}

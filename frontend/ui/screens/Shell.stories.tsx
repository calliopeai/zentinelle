import {
  EmptyState,
  PageFrame,
  activeFor,
  areaSwitcher,
  type TabNavItem,
} from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { navFor, type Role } from "../product";
import { capabilitiesOf } from "../storybook/session";
import { ShellStory } from "../storybook/ShellStory";

/**
 * Every area in the shell, before its screens exist: the nav with the row
 * active, and an empty PageFrame with the crumb switcher and the tab row the
 * approved IA gives each function (ui-overhaul-ia §4.1). Click through the
 * sidebar and the crumb; each function shows its own frame. An area agent
 * replaces the empty frame with its screen in its own story.
 */
const meta = {
  title: "Screens/Shell",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;

type Story = StoryObj;

/** The tabs of each function, as §4.1 names them. Views and actions are left to the screens. */
const TABS: Record<string, readonly string[]> = {
  policies: ["All", "Hierarchy", "Effective", "Changes"],
  "content-rules": ["Rules", "Detections"],
  alerts: ["Open", "All", "Mine"],
  risks: ["Register", "Overview"],
  compliance: ["Frameworks", "Gaps"],
  evidence: ["Coverage", "MITRE ATLAS", "BROCS"],
  usage: ["Overview", "Budgets", "Anomalies"],
  models: ["Models", "Route check"],
  general: [
    "Organization",
    "Enforcement",
    "Notifications",
    "Runtime",
    "Bootstrap tokens",
  ],
  retention: ["Policies", "Legal holds"],
};

function EmptyFrame({ path, role }: { path: string; role: Role }) {
  const nav = navFor(capabilitiesOf(role));
  const active = activeFor(nav, path);
  const area = nav.find((a) => a.key === active?.area);
  const fn = area?.groups
    .flatMap((g) => g.functions)
    .find((f) => f.key === active?.fn);
  if (!area || !fn) {
    return (
      <PageFrame title="Not found">
        <EmptyState
          title="This page is not in the navigation"
          actionHref="/dashboard"
          actionLabel="Back to Overview"
        />
      </PageFrame>
    );
  }
  const tabs: TabNavItem[] | undefined = TABS[fn.key]?.map((label, i) => ({
    key: label,
    label,
    href: `${fn.href}?tab=${encodeURIComponent(label.toLowerCase())}`,
    active: i === 0,
  }));
  return (
    <PageFrame
      crumbs={area.flat ? undefined : [areaSwitcher(nav, area.key, fn.key)]}
      title={fn.label}
      tabs={tabs}
      tabsLabel={tabs ? `${fn.label} tabs` : undefined}
    >
      <EmptyState
        title={`The ${fn.label} screen goes here`}
        description="Built and reviewed in Storybook first, then assembled into the route."
      />
    </PageFrame>
  );
}

function area(path: string, role: Role = "admin"): Story {
  return {
    render: () => (
      <ShellStory path={path} role={role} defaultAssistantHidden>
        {(current) => <EmptyFrame path={current} role={role} />}
      </ShellStory>
    ),
  };
}

export const Overview = area("/dashboard");

export const Agents: Story = {
  ...area("/agents"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Agents" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Approvals" }),
    ).toBeInTheDocument();
  },
};

export const Policies: Story = {
  ...area("/policies"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ["All", "Hierarchy", "Effective", "Changes"]) {
      await expect(canvas.getByRole("link", { name })).toBeInTheDocument();
    }
  },
};

export const Activity = area("/alerts");

export const RiskAndCompliance = area("/risks");

export const ModelsAndUsage = area("/usage");

export const Settings = area("/settings");

/** An Astrolift deeplink path (`/risk`) lands on Risks. */
export const RiskDeeplink = area("/risk", "viewer");

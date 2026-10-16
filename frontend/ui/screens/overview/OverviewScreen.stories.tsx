import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import type { Role } from "../../product";
import {
  dashboardStats,
  emptyDashboardStats,
} from "../../storybook/fixtures/dashboard";
import {
  OVERVIEW_NOW,
  longDashboardStats,
  openAlerts,
  quietRiskStats,
  riskStats,
} from "../../storybook/fixtures/overview";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { toOverview, type OverviewInput } from "./overview-model";
import { OverviewScreen, type OverviewScreenProps } from "./OverviewScreen";

/** The Overview in the shell, at `/dashboard`, as each role sees it. */
const meta = {
  title: "Screens/Overview/OverviewScreen",
  parameters: {
    layout: "fullscreen",
    viewport: {
      options: {
        narrow: {
          name: "768px",
          styles: { width: "768px", height: "1024px" },
          type: "tablet",
        },
      },
    },
  },
} satisfies Meta;
export default meta;

type Story = StoryObj;

const FULL: OverviewInput = {
  stats: dashboardStats.dashboardStats,
  riskStats: riskStats.riskStats,
  openAlerts: openAlerts.complianceAlerts,
  pendingApprovals: 4,
  stagedChanges: 2,
};

function screen(
  props: Partial<OverviewScreenProps> & { input?: OverviewInput },
  role: Role = "operator",
  path = "/dashboard",
): Story {
  const { input = FULL, ...rest } = props;
  return {
    render: () => (
      <ShellStory path={path} role={role} defaultAssistantHidden>
        <OverviewScreen
          data={toOverview(input)}
          canMutate={capabilitiesOf(role).includes("mutate")}
          now={OVERVIEW_NOW}
          onRetry={() => {}}
          {...rest}
        />
      </ShellStory>
    ),
  };
}

export const Populated: Story = {
  ...screen({}),
  play: async ({ canvasElement }) => {
    // The sidebar has its own Audit log row; look in the page.
    const canvas = within(within(canvasElement).getByRole("main"));
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Audit log" }),
    ).toHaveAttribute("href", "/audit-logs");
    await expect(
      canvas.getByRole("link", { name: "Turn on a compliance framework" }),
    ).toBeInTheDocument();
  },
};

export const Loading = screen({ data: null, loading: true });

/** A new organization: nothing registered, the setup steps lead. */
export const Empty = screen({
  input: {
    stats: emptyDashboardStats.dashboardStats,
    riskStats: quietRiskStats.riskStats,
    openAlerts: [],
  },
});

/** Set up and quiet: nothing needs attention, no setup card. */
export const AllClear = screen({
  input: {
    stats: {
      ...dashboardStats.dashboardStats!,
      agents: { total: 14, active: 14, inactive: 0, healthy: 14, unhealthy: 0 },
      checklist: null,
    },
    riskStats: quietRiskStats.riskStats,
    openAlerts: [],
  },
});

export const Failed = screen({
  data: null,
  error: { message: "Something went wrong on the server." },
});

/** DashboardStats loaded; risk statistics and alerts did not. */
export const PartialError = screen({
  input: { ...FULL, riskStats: null, openAlerts: [] },
  attentionError: { message: "Risk statistics are unavailable." },
});

/** A viewer reads everything and changes nothing: no setup links. */
export const Viewer: Story = {
  ...screen({}, "viewer"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/An operator or admin can take the rest/),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("link", { name: "Turn on a compliance framework" }),
    ).not.toBeInTheDocument();
  },
};

export const Admin = screen({}, "admin");

export const LongData = screen({
  input: {
    ...FULL,
    stats: longDashboardStats.dashboardStats,
    pendingApprovals: 4096,
  },
});

/** `/governance`, the Astrolift deeplink, lands on the same screen. */
export const GovernanceDeeplink = screen({}, "operator", "/governance");

export const Narrow: Story = {
  ...screen({}),
  globals: { viewport: { value: "narrow", isRotated: false } },
};

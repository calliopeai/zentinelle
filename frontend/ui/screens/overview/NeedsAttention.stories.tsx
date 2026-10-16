import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { dashboardStats } from "../../storybook/fixtures/dashboard";
import {
  longDashboardStats,
  openAlerts,
  riskStats,
} from "../../storybook/fixtures/overview";
import { NeedsAttention } from "./NeedsAttention";
import { toOverview } from "./overview-model";

const items = toOverview({
  stats: dashboardStats.dashboardStats,
  riskStats: riskStats.riskStats,
  openAlerts: openAlerts.complianceAlerts,
  pendingApprovals: 4,
  stagedChanges: 2,
}).attention;

const meta = {
  title: "Screens/Overview/NeedsAttention",
  component: NeedsAttention,
  args: { items },
} satisfies Meta<typeof NeedsAttention>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const links = canvas.getAllByRole("link");
    // Most urgent first: alerts, then incidents, then approvals.
    await expect(links[0]).toHaveTextContent("3 open alerts");
    await expect(
      canvas.getByRole("link", { name: "4 actions waiting for approval" }),
    ).toHaveAttribute("href", "/agents/approvals");
  },
};

export const Loading: Story = { args: { items: [], loading: true } };

export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Nothing needs attention"),
    ).toBeInTheDocument();
  },
};

/** Some signals failed: the rows that loaded stay, under the error. */
export const PartialError: Story = {
  args: {
    items: items.slice(2),
    error: { message: "Risk statistics are unavailable." },
    onRetry: () => {},
  },
};

/** Every signal failed: an error, never "nothing needs attention". */
export const AllFailed: Story = {
  args: {
    items: [],
    error: { message: "Alerts are unavailable." },
    onRetry: () => {},
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByText("Nothing needs attention"),
    ).not.toBeInTheDocument();
  },
};

export const LongData: Story = {
  args: {
    items: toOverview({
      stats: longDashboardStats.dashboardStats,
      riskStats: {
        ...riskStats.riskStats!,
        openIncidents: 1204,
        slaBreachedCount: 377,
        criticalRisks: 98,
      },
      openAlerts: Array.from({ length: 250 }, (_, i) => ({
        ...openAlerts.complianceAlerts[0],
        id: `bulk-${i}`,
      })),
      pendingApprovals: 4096,
      stagedChanges: 12,
    }).attention,
  },
};

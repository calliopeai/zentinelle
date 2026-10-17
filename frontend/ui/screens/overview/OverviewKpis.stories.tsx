import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import {
  dashboardStats,
  emptyDashboardStats,
} from "../../storybook/fixtures/dashboard";
import {
  longDashboardStats,
  riskStats,
} from "../../storybook/fixtures/overview";
import { OverviewKpis } from "./OverviewKpis";
import { toOverview } from "./overview-model";

const kpis = (
  stats = dashboardStats,
  risks: typeof riskStats.riskStats | null = riskStats.riskStats,
) =>
  toOverview({ stats: stats.dashboardStats, riskStats: risks, openAlerts: [] })
    .kpis;

const meta = {
  title: "Screens/Overview/OverviewKpis",
  component: OverviewKpis,
  args: { kpis: kpis() },
} satisfies Meta<typeof OverviewKpis>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Open incidents" }),
    ).toHaveAttribute("href", "/incidents");
    await expect(canvas.getByText("1 past SLA")).toBeInTheDocument();
  },
};

export const Loading: Story = { args: { loading: true } };

export const Empty: Story = { args: { kpis: kpis(emptyDashboardStats) } };

/** GetRiskStats failed: the incidents tile says so instead of showing 0. */
export const RiskStatsUnavailable: Story = {
  args: { kpis: kpis(dashboardStats, null) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Not available"),
    ).toBeInTheDocument();
  },
};

export const LongData: Story = { args: { kpis: kpis(longDashboardStats) } };

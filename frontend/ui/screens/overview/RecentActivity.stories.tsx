import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { dashboardStats } from "../../storybook/fixtures/dashboard";
import {
  OVERVIEW_NOW,
  longDashboardStats,
} from "../../storybook/fixtures/overview";
import { toOverview } from "./overview-model";
import { RecentActivity } from "./RecentActivity";

const entries = (stats = dashboardStats) =>
  toOverview({ stats: stats.dashboardStats, riskStats: null, openAlerts: [] })
    .activity;

const meta = {
  title: "Screens/Overview/RecentActivity",
  component: RecentActivity,
  args: { entries: entries(), now: OVERVIEW_NOW },
} satisfies Meta<typeof RecentActivity>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("58 min ago"),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = { args: { entries: [], loading: true } };

export const Empty: Story = { args: { entries: [] } };

/** Six rows at most, however much the server sends. */
export const LongData: Story = {
  args: { entries: entries(longDashboardStats) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole("listitem")).toHaveLength(
      6,
    );
  },
};

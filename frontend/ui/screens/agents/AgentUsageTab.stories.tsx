import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { usage } from "../../storybook/fixtures/agents";
import { AgentUsageTab } from "./AgentUsageTab";

/** Usage: GetUsageMetrics' summary for one agent. Each tile links to Usage. */
const meta = {
  title: "Screens/Agents/Tabs/Usage",
  component: AgentUsageTab,
  args: {
    summary: usage.usageMetrics!.summary,
    loading: false,
    window: "Last 30 days",
    usageHref: "/usage?agent=support-bot",
    onRetry: fn(),
  },
} satisfies Meta<typeof AgentUsageTab>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {};
export const Loading: Story = { args: { loading: true, summary: null } };
export const Empty: Story = { args: { summary: null } };
export const LoadFailed: Story = {
  args: { error: { message: "Something went wrong on the server." } },
};
export const LongData: Story = {
  args: {
    summary: {
      totalApiCalls: 9_812_440_120,
      totalTokens: 1_284_022_310_442,
      totalCost: 4_821_177.31,
      activeAgents: 1,
      storageUsedMb: 0,
    },
  },
};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-192">
        <Story />
      </div>
    ),
  ],
};

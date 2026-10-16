import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { OVERVIEW_NOW, overviewMocks } from "../../storybook/fixtures/overview";
import { ShellStory } from "../../storybook/ShellStory";
import { OverviewConnected } from "./OverviewConnected";

/**
 * The Overview on the app's own hooks, answered by mocks of the operations
 * it sends: DashboardStats, GetRiskStats and ComplianceAlerts.
 */
const meta = {
  title: "Screens/Overview/OverviewConnected",
  component: OverviewConnected,
  parameters: { layout: "fullscreen" },
  args: { canMutate: true, now: OVERVIEW_NOW },
  decorators: [
    (Story) => (
      <ShellStory path="/dashboard" role="operator" defaultAssistantHidden>
        <Story />
      </ShellStory>
    ),
  ],
} satisfies Meta<typeof OverviewConnected>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  parameters: { graphql: { mocks: overviewMocks.full } },
  args: { pendingApprovals: 4, stagedChanges: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("link", { name: "3 open alerts" }),
    ).toHaveAttribute("href", "/alerts");
    await expect(
      canvas.getByRole("link", { name: "3 open incidents" }),
    ).toBeInTheDocument();
  },
};

export const Empty: Story = {
  parameters: { graphql: { mocks: overviewMocks.empty } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Nothing needs attention"),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: { graphql: { mocks: overviewMocks.loading } },
};

export const Failed: Story = {
  parameters: { graphql: { mocks: overviewMocks.error } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Could not load the overview"),
    ).toBeInTheDocument();
  },
};

export const PartialError: Story = {
  parameters: { graphql: { mocks: overviewMocks.partial } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Some signals could not be read"),
    ).toBeInTheDocument();
  },
};

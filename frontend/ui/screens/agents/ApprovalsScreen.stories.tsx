import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import {
  NOW,
  heldRequests,
  longRequest,
} from "../../storybook/fixtures/agents";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { narrow } from "../../storybook/viewport";
import { ApprovalsScreen, type ApprovalsScreenProps } from "./ApprovalsScreen";

/** Approvals: the inbox of held agent actions (#440), under Agents. */
const meta = {
  title: "Screens/Agents/Approvals",
  component: ApprovalsScreen,
  parameters: { layout: "fullscreen" },
  args: {
    requests: heldRequests(),
    loading: false,
    error: "",
    notice: "",
    busyId: null,
    now: NOW,
    capabilities: capabilitiesOf("operator"),
    reasons: {},
    onReasonChange: fn(),
    onDecide: fn(),
    onRefresh: fn(),
  },
  render: (args) => (
    <ShellStory path="/agents/approvals" role="operator" defaultAssistantHidden>
      <ApprovalsScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof ApprovalsScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {};

export const Loading: Story = { args: { requests: [], loading: true } };

export const Empty: Story = { args: { requests: [] } };

/** A refresh failed: the list is cleared and decisions wait for a good refresh. */
export const RefreshFailed: Story = {
  args: {
    requests: [],
    error:
      "Approvals could not be refreshed. Decisions are disabled until a refresh succeeds.",
  },
};

export const Decided: Story = {
  args: {
    requests: heldRequests().slice(1),
    notice: `Request ${heldRequests()[0].request_id} approved. The host may retry under current policy.`,
  },
};

export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory path="/agents/approvals" role="viewer" defaultAssistantHidden>
      <ApprovalsScreen {...args} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/view-only access/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
  },
};

export const LongData: Story = {
  args: { requests: [longRequest, ...heldRequests()] },
};

export const Narrow: Story = {
  ...narrow,
  render: (args: ApprovalsScreenProps) => (
    <ShellStory path="/agents/approvals" role="operator" defaultAssistantHidden>
      <ApprovalsScreen {...args} />
    </ShellStory>
  ),
};

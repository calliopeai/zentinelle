import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import type { HeldApproval } from "@/lib/approvals";

import { heldRequests } from "../../storybook/fixtures/agents";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { narrow } from "../../storybook/viewport";
import { ApprovalsRoute, type ApprovalsClient } from "./ApprovalsRoute";

/** An inbox the story owns: requests at times around now, decisions that remove them. */
function inbox(
  options: { failList?: boolean; failDecide?: boolean; empty?: boolean } = {},
): ApprovalsClient {
  let rows: HeldApproval[] = options.empty ? [] : heldRequests(Date.now());
  return {
    list: async () => {
      if (options.failList)
        throw new Error(
          "Approvals could not be refreshed. Decisions are disabled until a refresh succeeds.",
        );
      return rows;
    },
    decide: async (id) => {
      if (options.failDecide)
        throw new Error(
          "The decision could not be confirmed. Refresh before trying again.",
        );
      rows = rows.filter((r) => r.request_id !== id);
    },
  };
}

const never: ApprovalsClient = {
  list: () => new Promise(() => {}),
  decide: async () => {},
};

/** The Approvals route (#440's behaviour) over a story client in place of lib/approvals. */
const meta = {
  title: "Screens/Agents/Routes/Approvals",
  component: ApprovalsRoute,
  parameters: { layout: "fullscreen" },
  args: { capabilities: capabilitiesOf("operator"), client: inbox() },
  render: (args) => (
    <ShellStory path="/agents/approvals" role="operator" defaultAssistantHidden>
      <ApprovalsRoute {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof ApprovalsRoute>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Approving removes the request and confirms what happened. */
export const Approve: Story = {
  args: { client: inbox() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = await canvas.findAllByRole("button", { name: "Approve" });
    await waitFor(() => expect(first[0]).toBeEnabled());
    await userEvent.click(first[0]);
    await expect(
      await canvas.findByText(/approved\. The host may retry/),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = { args: { client: never } };
export const Empty: Story = { args: { client: inbox({ empty: true }) } };
export const RefreshFailed: Story = {
  args: { client: inbox({ failList: true }) },
};

/** A failed decision is never retried: the inbox clears and asks for a refresh. */
export const DecisionFailed: Story = {
  args: { client: inbox({ failDecide: true }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const deny = await canvas.findAllByRole("button", { name: "Deny" });
    await waitFor(() => expect(deny[0]).toBeEnabled());
    await userEvent.click(deny[0]);
    await expect(
      await canvas.findByText(/could not be confirmed/),
    ).toBeInTheDocument();
  },
};

export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer"), client: inbox() },
  render: (args) => (
    <ShellStory path="/agents/approvals" role="viewer" defaultAssistantHidden>
      <ApprovalsRoute {...args} />
    </ShellStory>
  ),
};

export const Narrow: Story = {
  ...narrow,
  render: (args) => (
    <ShellStory path="/agents/approvals" role="operator" defaultAssistantHidden>
      <ApprovalsRoute {...args} />
    </ShellStory>
  ),
};

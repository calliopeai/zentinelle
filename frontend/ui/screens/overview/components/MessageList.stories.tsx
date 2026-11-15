import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  conversation,
  longConversation,
  pendingApproval,
  settledActions,
  streaming,
} from "../../../storybook/fixtures/assistant";
import { MessageList } from "./MessageList";

const meta = {
  title: "Screens/Overview/Components/MessageList",
  component: MessageList,
  decorators: [
    (Story) => (
      <div className="flex h-[32rem] flex-col">
        <Story />
      </div>
    ),
  ],
  args: {
    messages: conversation,
    isStreaming: false,
    canMutate: true,
    onApprove: fn(),
    onReject: fn(),
  },
} satisfies Meta<typeof MessageList>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Conversation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("2 results")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Events" })).toHaveAttribute(
      "href",
      "/events",
    );
  },
};

export const Empty: Story = { args: { messages: [] } };

export const Streaming: Story = {
  args: { messages: streaming, isStreaming: true },
};

export const PendingApproval: Story = {
  args: { messages: pendingApproval },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Approve" }),
    );
    await expect(args.onApprove).toHaveBeenCalledWith(
      "a1b2c3",
      "Pause agent etl-runner until 2026-10-17 00:00 UTC",
    );
  },
};

/** A viewer sees the proposal, not the buttons. */
export const PendingForViewer: Story = {
  args: { messages: pendingApproval, canMutate: false },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
  },
};

export const SettledActions: Story = { args: { messages: settledActions } };

export const LongData: Story = { args: { messages: longConversation } };

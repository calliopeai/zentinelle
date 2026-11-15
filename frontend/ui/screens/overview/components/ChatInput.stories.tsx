import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { ChatInput } from "./ChatInput";

const meta = {
  title: "Screens/Overview/Components/ChatInput",
  component: ChatInput,
  args: { onSend: fn(), onStop: fn(), isStreaming: false },
} satisfies Meta<typeof ChatInput>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Send message" }),
    ).toBeDisabled();
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "Which agents are unhealthy?{Enter}",
    );
    await expect(args.onSend).toHaveBeenCalledWith(
      "Which agents are unhealthy?",
    );
  },
};

export const Streaming: Story = {
  args: { isStreaming: true },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Stop generating" }),
    );
    await expect(args.onStop).toHaveBeenCalled();
  },
};

/** In the bubble: Enter makes a new line, Cmd+Enter sends. */
export const Compact: Story = { args: { compact: true } };

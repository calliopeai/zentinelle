import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen } from "storybook/test";

import { events, longEvents } from "../../storybook/fixtures/activity";
import { EventDrawer } from "./EventDrawer";

const meta = {
  title: "Activity/EventDrawer",
  component: EventDrawer,
  args: { event: events[0], onClose: fn() },
} satisfies Meta<typeof EventDrawer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async () => {
    await expect(await screen.findByLabelText("Payload")).toHaveTextContent(
      "input_tokens",
    );
  },
};

/** Failed and never processed. */
export const Failed: Story = { args: { event: events[3] } };

export const LongData: Story = { args: { event: longEvents[0] } };

export const Closed: Story = { args: { event: null } };

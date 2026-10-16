import { Button } from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Card } from "./Card";

const meta = {
  title: "Shared/Card",
  component: Card,
  args: {
    title: "Resolved configuration",
    description: "What the agent runs with after inheritance.",
    children: <p className="text-sm">Three policies apply.</p>,
  },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: { action: <Button size="sm">Edit</Button> },
};

export const Untitled: Story = { args: { title: undefined } };

export const LongTitle: Story = {
  args: {
    title:
      "A policy name long enough to wrap onto several lines without pushing the action off the edge of the card",
    action: <Button size="sm">Edit</Button>,
  },
};

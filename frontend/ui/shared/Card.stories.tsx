import { Button } from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Card } from "./Card";

/** The one bordered box. A candidate for @calliopelabs/ui. */
const meta = {
  title: "Shared/Card",
  component: Card,
  args: {
    title: "Model routes",
    children: <p className="text-sm">anthropic/claude-sonnet-4-5</p>,
  },
} satisfies Meta<typeof Card>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: {
    action: (
      <Button size="xs" variant="outline">
        Edit
      </Button>
    ),
  },
};

export const Untitled: Story = { args: { title: undefined } };

export const LongTitle: Story = {
  args: {
    title:
      "Customer support escalation router for the EMEA enterprise tier, second generation, model routes",
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
};

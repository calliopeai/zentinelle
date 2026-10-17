import { Button } from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Card } from "./Card";

const meta = {
  title: "Patterns/Card",
  component: Card,
  args: { children: "Card content." },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const WithTitleAndAction: Story = {
  args: {
    title: "By level",
    action: (
      <Button size="sm" variant="outline">
        Open
      </Button>
    ),
  },
};

export const LongTitle: Story = {
  args: {
    title:
      "Residual risk after mitigation for the cross-tenant retrieval through the shared vector index",
    children: "The title wraps instead of overflowing.",
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";

import { Panel } from "./Panel";

const meta = {
  title: "Shared/Panel",
  component: Panel,
  args: {
    title: "Top agents by cost",
    children: <p className="text-sm text-muted-foreground">Panel body.</p>,
  },
} satisfies Meta<typeof Panel>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: {
    action: (
      <a href="/usage" className="text-xs underline">
        Open usage
      </a>
    ),
  },
};

export const Untitled: Story = { args: { title: undefined } };

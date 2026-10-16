import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { StatTile } from "./StatTile";

const meta = {
  title: "Components/StatTile",
  component: StatTile,
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
  args: {
    label: "Agents",
    value: "14",
    detail: "11 active, 1 not healthy",
    href: "/agents",
    tone: "warn",
  },
} satisfies Meta<typeof StatTile>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Linked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "Agents" })).toHaveAttribute(
      "href",
      "/agents",
    );
  },
};

export const Healthy: Story = {
  args: { detail: "14 active, all healthy", tone: "ok" },
};

export const Plain: Story = {
  args: { href: undefined, tone: undefined, detail: "Read only" },
};

export const Loading: Story = { args: { loading: true } };

export const Unavailable: Story = {
  args: { value: null, detail: "Could not be read", tone: undefined },
};

export const LongData: Story = {
  args: {
    label: "Events recorded today across every registered agent",
    value: "12,345,678",
    detail:
      "+1,240.5% this week against the week before, across 312 agents in 9 groups",
  },
};

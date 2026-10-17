import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { StatTile } from "./StatTile";

/** One figure. A tile with `href` links to the list it counts. A candidate for @calliopelabs/ui. */
const meta = {
  title: "Shared/StatTile",
  component: StatTile,
  args: { label: "API calls", value: "18,240", hint: "Last 30 days" },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatTile>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Linked: Story = {
  args: { href: "/usage" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link")).toHaveAttribute(
      "href",
      "/usage",
    );
  },
};

export const LongValue: Story = {
  args: {
    label: "Tokens",
    value: "1,284,022,310,442",
    hint: "Last 30 days, estimated from registry prices",
  },
};

export const Row: Story = {
  decorators: [
    (Story) => (
      <div className="grid w-192 grid-cols-3 gap-4">
        <Story />
        <StatTile label="Tokens" value="41,822,310" />
        <StatTile label="Cost" value="$312.48" hint="estimated" />
      </div>
    ),
  ],
};

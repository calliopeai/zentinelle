import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { StatGrid, StatTile } from "./StatTile";

const meta = {
  title: "Patterns/StatTile",
  component: StatTile,
  args: { label: "Open risks", value: 6, hint: "of 7 in the register" },
} satisfies Meta<typeof StatTile>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Linked: Story = {
  args: { href: "/risks", tone: "warn" },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: "Open risks" }),
    ).toHaveAttribute("href", "/risks");
  },
};

export const Loading: Story = { args: { loading: true } };

export const Unknown: Story = {
  args: { value: null, hint: "The server did not say" },
};

export const Grid: Story = {
  render: () => (
    <StatGrid>
      <StatTile label="Open risks" value={6} href="/risks" />
      <StatTile
        label="Critical"
        value={1}
        tone="error"
        hint="RPN 200 or more"
      />
      <StatTile label="High" value={0} tone="ok" />
      <StatTile
        label="Required capabilities missing across every tracked framework"
        value="1,204"
        hint="A long label truncates; a long hint wraps onto a second line under the figure."
      />
    </StatGrid>
  ),
};

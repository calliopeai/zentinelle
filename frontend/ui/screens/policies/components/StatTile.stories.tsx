import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatTile } from "./StatTile";

const meta = {
  title: "Policies/Components/StatTile",
  component: StatTile,
  args: { label: "Enabled policies", value: 24, hint: "of 27" },
} satisfies Meta<typeof StatTile>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Linked: Story = { args: { href: "/policies" } };
export const Warn: Story = {
  args: { label: "Conflicts", value: 2, tone: "warn", hint: "need a decision" },
};
export const Row: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="Policies" value={27} />
      <StatTile label="Enforced" value={19} tone="ok" />
      <StatTile label="Audit only" value={5} tone="info" />
      <StatTile label="Disabled" value={3} tone="muted" />
    </div>
  ),
};
export const LongValue: Story = {
  args: { label: "Events in the window", value: "1,284,331,902" },
};

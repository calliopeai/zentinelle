import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatTile } from "./StatTile";

const meta = {
  title: "Activity/Components/StatTile",
  component: StatTile,
  args: { label: "Time to acknowledge", value: "4m 10s", hint: "Target 15m" },
} satisfies Meta<typeof StatTile>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const WithTone: Story = { args: { tone: "ok" } };

export const Breached: Story = {
  args: {
    label: "SLA",
    value: "Breached",
    hint: "Resolve within 4h",
    tone: "error",
  },
};

export const Row: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <StatTile label="Time to acknowledge" value="4m 10s" tone="ok" />
      <StatTile label="Time to resolve" value="–" hint="Still open" />
      <StatTile label="SLA" value="At risk" tone="warn" />
    </div>
  ),
};

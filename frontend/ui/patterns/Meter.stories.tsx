import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Meter } from "./Meter";

const meta = {
  title: "Patterns/Meter",
  component: Meter,
  args: {
    label: "Required capabilities configured",
    value: 4,
    max: 6,
    tone: "warn",
  },
} satisfies Meta<typeof Meter>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const meter = within(canvasElement).getByRole("meter", {
      name: "Required capabilities configured",
    });
    await expect(meter).toHaveAttribute("aria-valuenow", "4");
  },
};

export const Full: Story = { args: { value: 6, tone: "ok" } };

export const Empty: Story = { args: { value: 0, tone: "error" } };

export const NoCeiling: Story = {
  args: { value: 0, max: 0, valueText: "Nothing to count" },
};

export const Compact: Story = { args: { compact: true } };

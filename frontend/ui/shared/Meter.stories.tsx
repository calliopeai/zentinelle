import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Meter } from "./Meter";

const meta = {
  title: "Shared/Meter",
  component: Meter,
  args: {
    label: "Context window",
    value: 24000,
    max: 200000,
    valueText: "12% of 200K tokens",
  },
} satisfies Meta<typeof Meter>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("meter", { name: "Context window" }),
    ).toHaveAttribute("aria-valuetext", "12% of 200K tokens");
  },
};

export const Empty: Story = {
  args: { value: 0, valueText: "0% of 200K tokens" },
};

export const Over: Story = {
  args: { value: 260000, valueText: "130% of 200K tokens" },
};

/** A coverage meter: a tone for the fill, and "value of max" by default. */
export const Toned: Story = {
  args: {
    label: "Required capabilities configured",
    value: 4,
    max: 6,
    valueText: undefined,
    tone: "warn",
  },
  play: async ({ canvasElement }) => {
    const meter = within(canvasElement).getByRole("meter", {
      name: "Required capabilities configured",
    });
    await expect(meter).toHaveAttribute("aria-valuenow", "4");
    await expect(meter).toHaveAttribute("aria-valuetext", "4 of 6");
  },
};

export const Full: Story = {
  args: { ...Toned.args, value: 6, tone: "ok" },
};

export const EmptyToned: Story = {
  args: { ...Toned.args, value: 0, tone: "error" },
};

export const NoCeiling: Story = {
  args: { ...Toned.args, value: 0, max: 0, valueText: "Nothing to count" },
};

export const Compact: Story = {
  args: { ...Toned.args, compact: true },
};

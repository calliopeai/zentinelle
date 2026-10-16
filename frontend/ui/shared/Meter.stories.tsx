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

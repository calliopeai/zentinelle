import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Segmented } from "./Segmented";

const OPTIONS = [
  { value: "1", label: "1d" },
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

const meta = {
  title: "Shared/Segmented",
  component: Segmented,
  args: { label: "Period", value: "30", options: OPTIONS, onChange: fn() },
} satisfies Meta<typeof Segmented>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Chooses: Story = {
  render: function Render(args) {
    const [value, setValue] = React.useState(args.value);
    return (
      <Segmented
        {...args}
        value={value}
        onChange={(next) => {
          setValue(next);
          args.onChange(next);
        }}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "7d" }));
    await expect(args.onChange).toHaveBeenCalledWith("7");
    await expect(canvas.getByRole("radio", { name: "7d" })).toBeChecked();
  },
};

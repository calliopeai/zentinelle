import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Switch } from "./Switch";

const meta = {
  title: "Shared/Switch",
  component: Switch,
  args: {
    label: "Available in the assistant",
    checked: true,
    onCheckedChange: fn(),
    showLabel: true,
  },
} satisfies Meta<typeof Switch>;
export default meta;

type Story = StoryObj<typeof meta>;

export const On: Story = {};

export const Off: Story = { args: { checked: false } };

export const Disabled: Story = { args: { disabled: true } };

export const LabelHidden: Story = { args: { showLabel: false } };

export const Toggles: Story = {
  render: function Render(args) {
    const [checked, setChecked] = React.useState(false);
    return (
      <Switch
        {...args}
        checked={checked}
        onCheckedChange={(next) => {
          setChecked(next);
          args.onCheckedChange(next);
        }}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const toggle = within(canvasElement).getByRole("switch", {
      name: "Available in the assistant",
    });
    await userEvent.click(toggle);
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import { chooseOption } from "../storybook/select";
import { SelectField } from "./SelectField";

const meta = {
  title: "Shared/Select field",
  component: SelectField,
  args: {
    label: "Group by",
    value: "endpoint",
    options: [
      { value: "endpoint", label: "Agent" },
      { value: "team", label: "Team" },
      { value: "app", label: "App" },
    ],
    onChange: fn(),
  },
} satisfies Meta<typeof SelectField>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await chooseOption(
      canvas.getByRole("combobox", { name: "Group by" }),
      "Team",
    );
    await expect(args.onChange).toHaveBeenCalledWith("team");
  },
};

export const HiddenLabel: Story = { args: { hideLabel: true } };

export const Disabled: Story = { args: { disabled: true } };

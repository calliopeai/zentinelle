import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";

import { Select } from "./Select";

const OPTIONS = [
  { value: "", label: "All types" },
  { value: "network_policy", label: "Network" },
  { value: "budget_limit", label: "Budgets" },
  { value: "human_oversight", label: "Oversight" },
];

function Controlled() {
  const [value, setValue] = React.useState("");
  return (
    <div className="flex flex-col gap-2">
      <Select
        aria-label="Policy type"
        options={OPTIONS}
        value={value}
        onValueChange={setValue}
        className="w-48"
      />
      <p className="text-sm">Selected: {value || "all"}</p>
    </div>
  );
}

const meta = {
  title: "Shared/Select",
  component: Select,
  args: {
    "aria-label": "Policy type",
    options: OPTIONS,
    value: "",
    onValueChange: () => {},
  },
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Interactive: Story = {
  render: () => <Controlled />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByRole("combobox", { name: "Policy type" }),
      "budget_limit",
    );
    await expect(
      canvas.getByText("Selected: budget_limit"),
    ).toBeInTheDocument();
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { FilterSelect } from "./FilterSelect";

const OPTIONS = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "offline", label: "Offline" },
];

/** One server-side filter in a list's toolbar. A candidate for @calliopelabs/ui's FilterBar. */
const meta = {
  title: "Shared/FilterSelect",
  component: FilterSelect,
  args: { label: "Status", value: "", options: OPTIONS, onChange: fn() },
} satisfies Meta<typeof FilterSelect>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Unfiltered: Story = {};

export const Filtered: Story = { args: { value: "suspended" } };

export const Changes: Story = {
  render: function Render(args) {
    const [value, setValue] = React.useState("");
    return (
      <FilterSelect
        {...args}
        value={value}
        onChange={(v) => {
          setValue(v);
          args.onChange(v);
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const select = within(canvasElement).getByRole("combobox", {
      name: "Status",
    });
    await userEvent.selectOptions(select, "offline");
    await expect(args.onChange).toHaveBeenCalledWith("offline");
  },
};

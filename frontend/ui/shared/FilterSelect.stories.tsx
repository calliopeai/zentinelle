import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";

import { FilterSelect } from "./FilterSelect";

const SEVERITIES = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const meta = {
  title: "Shared/FilterSelect",
  component: FilterSelect,
  args: {
    label: "Severity",
    value: "",
    options: SEVERITIES,
    onChange: () => {},
  },
} satisfies Meta<typeof FilterSelect>;
export default meta;

type Story = StoryObj<typeof meta>;

function Controlled(props: React.ComponentProps<typeof FilterSelect>) {
  const [value, setValue] = React.useState(props.value);
  return <FilterSelect {...props} value={value} onChange={setValue} />;
}

export const Unfiltered: Story = {};

export const Chosen: Story = { args: { value: "critical" } };

export const Interactive: Story = {
  render: (args) => <Controlled {...args} />,
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByLabelText("Severity");
    await userEvent.selectOptions(select, "high");
    await expect(select).toHaveValue("high");
  },
};

export const LongOptions: Story = {
  args: {
    label: "Alert type",
    allLabel: "Every alert type",
    options: [
      { value: "repeat_violations", label: "Repeat violations by one user" },
      {
        value: "violation_spike",
        label: "Violation rate spike across the organization",
      },
    ],
  },
};

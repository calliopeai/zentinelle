import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { FilterBar, type FilterSpec } from "./FilterBar";
import { ViewSwitch } from "./ViewSwitch";

const FILTERS: FilterSpec[] = [
  {
    key: "status",
    label: "Status",
    anyLabel: "Any status",
    options: [
      { value: "identified", label: "Identified" },
      { value: "closed", label: "Closed" },
    ],
  },
  {
    key: "riskLevel",
    label: "Level",
    anyLabel: "Any level",
    options: [
      { value: "critical", label: "Critical" },
      { value: "low", label: "Low" },
    ],
  },
];

const meta = {
  title: "Patterns/FilterBar",
  component: FilterBar,
  args: {
    filters: FILTERS,
    values: {},
    onChange: fn(),
    onClear: fn(),
  },
} satisfies Meta<typeof FilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FiltersOnly: Story = {};

function Live() {
  const [search, setSearch] = React.useState("");
  const [values, setValues] = React.useState<Record<string, string>>({});
  return (
    <FilterBar
      searchLabel="Search risks"
      search={search}
      onSearchChange={setSearch}
      filters={FILTERS}
      values={values}
      onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
      onClear={() => {
        setSearch("");
        setValues({});
      }}
      trailing={
        <ViewSwitch
          label="Views"
          active="list"
          views={[
            { key: "list", label: "List", href: "#list" },
            { key: "matrix", label: "Matrix", href: "#matrix" },
          ]}
        />
      }
    />
  );
}

export const WithSearchAndViews: Story = {
  render: () => <Live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Clear filters" }),
    ).toBeNull();
    await userEvent.selectOptions(canvas.getByLabelText("Status"), "closed");
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear filters" }),
    );
    await expect(canvas.getByLabelText("Status")).toHaveValue("");
  },
};

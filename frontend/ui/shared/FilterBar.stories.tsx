import { Select } from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";

import { ViewSwitch } from "../patterns/ViewSwitch";
import { chooseOption } from "../storybook/select";
import { FilterBar } from "./FilterBar";
import { ANY, fromSelectValue, toSelectValue } from "./select-any";

const meta = {
  title: "Shared/FilterBar",
  component: FilterBar,
  args: {
    label: "Policy filters",
    children: (
      <>
        <Select
          aria-label="Type"
          options={[{ value: ANY, label: "All types" }]}
          value={ANY}
          onValueChange={() => {}}
          className="w-40"
        />
        <Select
          aria-label="Scope"
          options={[{ value: ANY, label: "All scopes" }]}
          value={ANY}
          onValueChange={() => {}}
          className="w-40"
        />
      </>
    ),
  },
} satisfies Meta<typeof FilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Filtered: Story = { args: { onClear: () => {} } };

const FILTERS = [
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

function Live() {
  const [search, setSearch] = React.useState("");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const narrowed = search.trim() !== "" || Object.values(values).some(Boolean);
  return (
    <FilterBar
      label="Filters"
      searchLabel="Search risks"
      search={search}
      onSearchChange={setSearch}
      onClear={
        narrowed
          ? () => {
              setSearch("");
              setValues({});
            }
          : undefined
      }
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
    >
      {FILTERS.map((filter) => (
        <Select
          key={filter.key}
          aria-label={filter.label}
          options={[{ value: ANY, label: filter.anyLabel }, ...filter.options]}
          value={toSelectValue(values[filter.key] ?? "")}
          onValueChange={(next) =>
            setValues((v) => ({ ...v, [filter.key]: fromSelectValue(next) }))
          }
        />
      ))}
    </FilterBar>
  );
}

/** Search, filter selects and a view switch above a list, as the risk register draws them. */
export const WithSearchAndViews: Story = {
  render: () => <Live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Clear filters" }),
    ).toBeNull();
    await chooseOption(canvas.getByLabelText("Status"), "Closed");
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear filters" }),
    );
    await expect(canvas.getByLabelText("Status")).toHaveTextContent(
      "Any status",
    );
  },
};

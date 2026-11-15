import { Select } from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { FilterBar } from "./FilterBar";
import { ANY } from "./select-any";

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

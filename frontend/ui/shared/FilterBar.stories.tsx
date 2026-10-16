import type { Meta, StoryObj } from "@storybook/react-vite";

import { FilterBar } from "./FilterBar";
import { Select } from "./Select";

const meta = {
  title: "Shared/FilterBar",
  component: FilterBar,
  args: {
    label: "Policy filters",
    children: (
      <>
        <Select
          aria-label="Type"
          options={[{ value: "", label: "All types" }]}
          value=""
          onValueChange={() => {}}
          className="w-40"
        />
        <Select
          aria-label="Scope"
          options={[{ value: "", label: "All scopes" }]}
          value=""
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

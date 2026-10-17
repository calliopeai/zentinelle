import { StatusBadge } from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { DefinitionList } from "./DefinitionList";

const meta = {
  title: "Policies/Components/DefinitionList",
  component: DefinitionList,
  args: {
    items: [
      { term: "Type", description: "Budget limit" },
      { term: "Scope", description: "Organization-wide" },
      {
        term: "Enforcement",
        description: <StatusBadge tone="ok">enforce</StatusBadge>,
      },
      { term: "Priority", description: "100" },
    ],
  },
} satisfies Meta<typeof DefinitionList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Columns: Story = {};
export const Stacked: Story = { args: { layout: "stacked" } };
export const LongValues: Story = {
  args: {
    items: [
      {
        term: "Description",
        description:
          "Caps monthly spend for every agent in the customer support deployment, with an alert at eighty percent and a hard stop at the limit, so that a runaway loop cannot exhaust the provider budget overnight.",
      },
      {
        term: "Created by",
        description: "a.very.long.service.account.name@automation.example.com",
      },
    ],
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";

import { DefinitionList } from "./DefinitionList";

const meta = {
  title: "Patterns/DefinitionList",
  component: DefinitionList,
  args: {
    items: [
      { term: "Owner", description: "Leo Mata" },
      { term: "Next review", description: "Dec 30, 2026" },
      { term: "Plan", description: null },
    ],
  },
} satisfies Meta<typeof DefinitionList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OneColumn: Story = {};

export const TwoColumns: Story = {
  args: {
    columns: 2,
    items: [
      { term: "Owner", description: "Leo Mata" },
      { term: "Identified", description: "Aug 12, 2026" },
      { term: "Last reviewed", description: "Never" },
      { term: "Incidents", description: "2 linked" },
    ],
  },
};

export const LongValues: Story = {
  args: {
    items: [
      {
        term: "Plan",
        description:
          "Rebuild the index per tenant; deny queries without a tenant filter at the gateway; replay the last 90 days of retrievals to find exposures. ".repeat(
            3,
          ),
      },
      {
        term: "Reference",
        description: "https://example.com/" + "a".repeat(120),
      },
    ],
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";

import { DefinitionList } from "./DefinitionList";

/** Term and value pairs that wrap. A candidate for @calliopelabs/ui. */
const meta = {
  title: "Shared/DefinitionList",
  component: DefinitionList,
  args: {
    items: [
      { term: "Type", value: "LangGraph" },
      { term: "Group", value: "Customer support" },
      { term: "Deployment", value: "astrolift-prod", mono: true },
      { term: "Owner", value: null },
    ],
  },
} satisfies Meta<typeof DefinitionList>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Empty values are dropped. */
export const Default: Story = {};

/** With a fallback, empty values are named instead. */
export const WithFallback: Story = { args: { fallback: "None", columns: 3 } };

export const OneColumn: Story = { args: { columns: 1 } };

export const LongValues: Story = {
  args: {
    items: [
      {
        term: "Session",
        value: "sess-6f1e0c4b9a8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d",
        mono: true,
      },
      {
        term: "Paths",
        value:
          "/srv/data/customers/emea/enterprise/2026/10/16/export-0001.parquet",
        mono: true,
      },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

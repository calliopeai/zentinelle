import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusBadge } from "@calliopelabs/ui";
import { expect, within } from "storybook/test";

import { DefinitionList } from "./DefinitionList";

const meta = {
  title: "Activity/Components/DefinitionList",
  component: DefinitionList,
  args: {
    items: [
      { term: "Type", value: "Data leak" },
      { term: "Agent", value: "support-bot" },
      {
        term: "Status",
        value: <StatusBadge tone="warn">investigating</StatusBadge>,
      },
      {
        term: "Correlation id",
        value: "c0ffee00-7f3c-4d1e-9b2a-55b2c041a1d9",
        mono: true,
      },
      { term: "Assignee", value: null },
    ],
  },
} satisfies Meta<typeof DefinitionList>;
export default meta;

type Story = StoryObj<typeof meta>;

export const TwoColumns: Story = {
  play: async ({ canvasElement }) => {
    // A missing value reads as missing.
    await expect(within(canvasElement).getByText("–")).toBeInTheDocument();
  },
};

export const OneColumn: Story = { args: { columns: 1 } };

export const LongValues: Story = {
  args: {
    items: [
      {
        term: "Root cause",
        value:
          "A retrieval tool returned a customer record from another tenant because the vector index was shared across two deployments that were meant to be isolated, and the filter on tenant id was applied after ranking rather than before it.",
      },
      {
        term: "User agent",
        value:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
        mono: true,
      },
    ],
  },
};

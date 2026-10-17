import type { Meta, StoryObj } from "@storybook/react-vite";

import { FactList } from "./FactList";

const meta = {
  title: "Shared/Fact list",
  component: FactList,
  args: {
    items: [
      { term: "Input price", value: "$3.00 / 1M", mono: true },
      { term: "Output price", value: "$15.00 / 1M", mono: true },
      { term: "Context window", value: "200K tokens", mono: true },
      { term: "Provider", value: "Anthropic" },
    ],
  },
} satisfies Meta<typeof FactList>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TwoColumns: Story = { args: { columns: 2 } };

export const LongStrings: Story = {
  args: {
    items: [
      {
        term: "Model",
        value:
          "bedrock/us.anthropic.claude-opus-4-5-20251101-v1:0-with-a-long-suffix",
        mono: true,
      },
      {
        term: "Reason",
        value:
          "Route allowed by the network policy for the production tier, region us-east-2.",
      },
    ],
  },
};

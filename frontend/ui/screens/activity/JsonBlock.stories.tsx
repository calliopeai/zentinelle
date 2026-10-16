import type { Meta, StoryObj } from "@storybook/react-vite";

import { JsonBlock } from "./JsonBlock";

const meta = {
  title: "Activity/JsonBlock",
  component: JsonBlock,
  args: {
    label: "Payload",
    value: { model: "claude-sonnet-4-5", input_tokens: 1840, blocked: false },
  },
} satisfies Meta<typeof JsonBlock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Payload: Story = {};

export const Missing: Story = { args: { value: null } };

export const LongData: Story = {
  args: {
    value: {
      note: "A retrieval tool returned a customer record that belongs to another tenant, because the vector index is shared by two deployments meant to be isolated.",
      nested: {
        depth: {
          of: { the: Array.from({ length: 30 }, (_, i) => `item-${i}`) },
        },
      },
    },
  },
};

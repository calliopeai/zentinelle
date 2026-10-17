import type { Meta, StoryObj } from "@storybook/react-vite";

import { CodeBlock } from "./CodeBlock";

const meta = {
  title: "Shared/CodeBlock",
  component: CodeBlock,
  args: {
    label: "Policy configuration",
    value: {
      monthly_budget_usd: 500,
      alert_threshold_percent: 80,
      hard_limit: true,
    },
  },
} satisfies Meta<typeof CodeBlock>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Json: Story = {};
export const Text: Story = {
  args: { label: "Prompt", value: "You are a careful support agent." },
};
export const LongLines: Story = {
  args: {
    maxHeight: "sm",
    value: {
      allowed_outbound_domains: Array.from(
        { length: 30 },
        (_, i) => `service-${i}.internal.a-very-long-domain-name.example.com`,
      ),
    },
  },
};

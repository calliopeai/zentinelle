import type { Meta, StoryObj } from "@storybook/react-vite";

import { Textarea } from "./Textarea";

const meta = {
  title: "Shared/Textarea",
  component: Textarea,
  args: {
    "aria-label": "Prompt text",
    defaultValue: "You are a careful support agent for {{company}}.",
  },
} satisfies Meta<typeof Textarea>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Mono: Story = {
  args: { mono: true, defaultValue: '{\n  "monthly_budget_usd": 500\n}' },
};
export const Invalid: Story = { args: { "aria-invalid": true } };

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { BarList } from "./BarList";

const meta = {
  title: "Shared/Bar list",
  component: BarList,
  args: {
    label: "Top agents by cost",
    emptyLabel: "No agent reported a cost in this period.",
    items: [
      {
        key: "a",
        label: "support-bot",
        value: 182.4,
        display: "$182.40",
        href: "/agents/a/usage",
      },
      {
        key: "b",
        label: "triage-agent",
        value: 96.1,
        display: "$96.10",
        href: "/agents/b/usage",
      },
      { key: "c", label: "research-assistant", value: 41.2, display: "$41.20" },
    ],
  },
} satisfies Meta<typeof BarList>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    await expect(
      canvas.getByRole("link", { name: "support-bot" }),
    ).toHaveAttribute("href", "/agents/a/usage");
  },
};

export const Empty: Story = { args: { items: [] } };

export const LongStrings: Story = {
  args: {
    items: [
      {
        key: "a",
        label:
          "customer-support-escalation-agent-for-enterprise-tier-accounts-eu-west-1",
        value: 18240331.5,
        display: "$18,240,331.50",
      },
      { key: "b", label: "x", value: 1, display: "$1.00" },
    ],
  },
};

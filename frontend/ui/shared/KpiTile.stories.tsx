import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { KpiTile, KpiRow } from "./KpiTile";

const meta = {
  title: "Shared/KPI tile",
  component: KpiTile,
  args: { label: "Total cost", value: "$412.88", hint: "Last 30 days" },
} satisfies Meta<typeof KpiTile>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Linked: Story = {
  args: { href: "/usage/budgets", hint: "Against 6 budget policies" },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link");
    await expect(link).toHaveAttribute("href", "/usage/budgets");
  },
};

export const Estimated: Story = {
  args: {
    label: "Estimated cost",
    estimated: true,
    hint: "Registry prices; tokens counted as characters / 4",
  },
};

export const Loading: Story = { args: { loading: true } };

export const LongStrings: Story = {
  args: {
    label: "Average latency across every endpoint that reported one",
    value: "1,284,331,902,114",
    hint: "triage-agent-with-a-very-long-name-from-astrolift-prod-us-east-2 is the slowest",
  },
};

export const Row: Story = {
  render: () => (
    <KpiRow label="Usage in the last 30 days">
      <KpiTile label="Tokens" value="9.4M" hint="Last 30 days" />
      <KpiTile label="Cost" value="$412.88" hint="Last 30 days" />
      <KpiTile label="Requests" value="412,880" hint="Last 30 days" />
      <KpiTile label="Average latency" value="842 ms" hint="7 endpoints" />
    </KpiRow>
  ),
};

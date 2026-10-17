import type { Meta, StoryObj } from "@storybook/react-vite";

import { riskTrend } from "../../../storybook/fixtures/risk";
import { RiskTrendChart } from "./RiskTrendChart";

const meta = {
  title: "Risk & compliance/Components/RiskTrendChart",
  component: RiskTrendChart,
  args: { points: riskTrend },
} satisfies Meta<typeof RiskTrendChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ThirtyDays: Story = {};

export const OneDay: Story = { args: { points: riskTrend.slice(-1) } };

export const Flat: Story = {
  args: { points: riskTrend.map((p) => ({ ...p, index: 0, open_count: 0 })) },
};

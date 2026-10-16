import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { TrendChart, type TrendPoint } from "./TrendChart";

const DAYS = Array.from({ length: 14 }, (_, i) => `Oct ${i + 3}`);
const VALUES = [
  410, 380, 455, 430, 470, 440, 1260, 460, 480, 450, 500, 470, 490, 520,
];

const series: TrendPoint[] = DAYS.map((label, i) => ({
  label,
  value: VALUES[i],
}));

const banded: TrendPoint[] = series.map((p, i) => ({
  ...p,
  band: i < 3 ? null : { lower: 340, upper: 560 },
  marked: i === 6,
}));

const meta = {
  title: "Shared/Trend chart",
  component: TrendChart,
  args: {
    label: "Tokens per day",
    points: series,
    formatValue: (v: number) => `${v}K`,
  },
} satisfies Meta<typeof TrendChart>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Line: Story = {};

export const Bars: Story = {
  args: { kind: "bar", label: "Cost per day", formatValue: (v) => `$${v}` },
};

export const BaselineAndAnomaly: Story = {
  args: { points: banded, label: "Tokens per day against the baseline" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("Expected range").length).toBeGreaterThan(
      0,
    );
    await expect(
      canvas.getByRole("table", {
        name: "Tokens per day against the baseline",
      }),
    ).toBeInTheDocument();
  },
};

export const NotEnoughData: Story = {
  args: { points: series.slice(0, 1) },
};

export const LongSeries: Story = {
  args: {
    points: Array.from({ length: 90 }, (_, i) => ({
      label: `Day ${i + 1}`,
      value: 400 + ((i * 37) % 120),
    })),
  },
};

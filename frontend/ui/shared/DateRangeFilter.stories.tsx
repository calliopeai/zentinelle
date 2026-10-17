import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, within } from "storybook/test";

import { DateRangeFilter, type DateRange } from "./DateRangeFilter";

const meta = {
  title: "Shared/DateRangeFilter",
  component: DateRangeFilter,
  args: { value: { from: "", to: "" }, onChange: () => {} },
} satisfies Meta<typeof DateRangeFilter>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Bounded: Story = {
  args: { value: { from: "2026-10-01", to: "2026-10-16" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("From")).toHaveValue("2026-10-01");
    await expect(canvas.getByLabelText("To")).toHaveAttribute(
      "min",
      "2026-10-01",
    );
  },
};

function Controlled() {
  const [value, setValue] = React.useState<DateRange>({ from: "", to: "" });
  return (
    <div className="flex flex-col gap-2">
      <DateRangeFilter value={value} onChange={setValue} />
      <p className="font-mono text-xs">{JSON.stringify(value)}</p>
    </div>
  );
}

export const Interactive: Story = { render: () => <Controlled /> };

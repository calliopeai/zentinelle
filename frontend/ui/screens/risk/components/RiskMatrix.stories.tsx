import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";

import { manyRisks, risks } from "../../../storybook/fixtures/risk";
import { RiskMatrix, type RiskMatrixProps } from "./RiskMatrix";

const meta = {
  title: "Risk & compliance/Components/RiskMatrix",
  component: RiskMatrix,
  args: { risks, onSelect: () => {} },
} satisfies Meta<typeof RiskMatrix>;
export default meta;
type Story = StoryObj<typeof meta>;

function Selectable(props: Omit<RiskMatrixProps, "selected" | "onSelect">) {
  const [selected, setSelected] =
    React.useState<RiskMatrixProps["selected"]>(null);
  return <RiskMatrix {...props} selected={selected} onSelect={setSelected} />;
}

export const Default: Story = {
  render: (args) => <Selectable risks={args.risks} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cell = canvas.getByRole("button", {
      name: "1 risk, likelihood Likely, impact Major",
    });
    await userEvent.click(cell);
    await expect(cell).toHaveAttribute("aria-pressed", "true");
  },
};

export const Empty: Story = { args: { risks: [] } };

export const Crowded: Story = { args: { risks: manyRisks } };

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { aiModels, longAiModels } from "../../storybook/fixtures/models";
import { EstimateCostDrawer } from "./EstimateCostDrawer";

const meta = {
  title: "Screens/Models & usage/Estimate cost",
  component: EstimateCostDrawer,
  args: { open: true, onOpenChange: fn(), models: aiModels.aiModels },
} satisfies Meta<typeof EstimateCostDrawer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Estimates: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // 4,000 characters: 1,000 tokens in, 1,000 out, at $3 and $15 per million.
    await userEvent.click(body.getByRole("textbox", { name: "Prompt" }));
    await userEvent.paste("x".repeat(4000));
    await expect(body.getByText("$0.0180")).toBeInTheDocument();
    await userEvent.selectOptions(
      body.getByRole("combobox", { name: "Model" }),
      "m2",
    );
    await expect(body.getByText("$0.0060")).toBeInTheDocument();
  },
};

export const FromARow: Story = { args: { modelId: "m3" } };

export const NoPricedModels: Story = {
  args: {
    models: aiModels.aiModels.map((m) => ({
      ...m,
      inputPricePerMillion: null,
    })),
  },
};

export const LongStrings: Story = { args: { models: longAiModels.aiModels } };

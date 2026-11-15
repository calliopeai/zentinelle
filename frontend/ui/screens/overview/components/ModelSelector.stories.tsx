import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import { chooseOption } from "../../../storybook/select";
import { assistantModels } from "../../../storybook/fixtures/assistant";
import { ModelSelector } from "./ModelSelector";

const meta = {
  title: "Screens/Overview/Components/ModelSelector",
  component: ModelSelector,
  args: {
    models: assistantModels,
    value: "claude-sonnet-4-20250514",
    onValueChange: fn(),
  },
} satisfies Meta<typeof ModelSelector>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Selected: Story = {
  play: async ({ args, canvasElement }) => {
    await chooseOption(
      within(canvasElement).getByRole("combobox", { name: "Model" }),
      "GPT-4o",
    );
    await expect(args.onValueChange).toHaveBeenCalledWith("gpt-4o");
  },
};

export const Loading: Story = { args: { loading: true } };

export const NoProviders: Story = { args: { models: [] } };

export const UnknownValue: Story = { args: { value: "retired-model" } };

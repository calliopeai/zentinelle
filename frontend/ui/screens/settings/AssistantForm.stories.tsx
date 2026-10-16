import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  defaultRuntime,
  longRuntime,
  runtime,
} from "../../storybook/fixtures/settings";
import { AssistantForm } from "./AssistantForm";

const meta = {
  title: "Settings/Parts/Assistant form",
  component: AssistantForm,
  parameters: { layout: "padded" },
  args: { snapshot: runtime, onStage: fn(async () => {}) },
} satisfies Meta<typeof AssistantForm>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Configured: Story = {};

export const SharedModel: Story = { args: { snapshot: defaultRuntime } };

export const LongValues: Story = { args: { snapshot: longRuntime } };

export const Stages: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("switch", { name: "Policy drafting" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Stage changes" }),
    );
    await expect(args.onStage).toHaveBeenCalledWith({
      policy_copilot_enabled: false,
    });
  },
};

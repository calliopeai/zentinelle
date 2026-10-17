import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  defaultRuntime,
  longRuntime,
  runtime,
} from "../../storybook/fixtures/settings";
import { RuntimeForm } from "./RuntimeForm";

const meta = {
  title: "Settings/Parts/Runtime form",
  component: RuntimeForm,
  parameters: { layout: "padded" },
  args: { snapshot: runtime, onStage: fn(async () => {}) },
} satisfies Meta<typeof RuntimeForm>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Configured: Story = {};

export const Defaults: Story = { args: { snapshot: defaultRuntime } };

export const LongValues: Story = { args: { snapshot: longRuntime } };

export const StagesOnlyWhatChanged: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByLabelText("Content capture"),
      "full",
    );
    await userEvent.clear(canvas.getByLabelText("Taxonomy extensions"));
    await userEvent.type(
      canvas.getByLabelText("Taxonomy extensions"),
      "team:red, team:blue",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Stage changes" }),
    );
    await expect(args.onStage).toHaveBeenCalledWith({
      content_capture_mode: "full",
      taxonomy_extensions: ["team:red", "team:blue"],
    });
    await expect(
      await canvas.findByText("Staged for approval"),
    ).toBeInTheDocument();
  },
};

export const OutOfBounds: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const refresh = canvas.getByLabelText("Model discovery, every (seconds)");
    await userEvent.clear(refresh);
    await userEvent.type(refresh, "60");
    await expect(
      canvas.getByText("From 300 to 86,400 seconds."),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Stage changes" }),
    ).toBeDisabled();
  },
};

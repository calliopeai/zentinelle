import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { runtime } from "../../storybook/fixtures/settings";
import { StagedChanges } from "./StagedChanges";

const meta = {
  title: "Settings/Parts/Staged changes",
  component: StagedChanges,
  parameters: { layout: "padded" },
  args: { changes: runtime.pending, onTransition: fn(async () => {}) },
} satisfies Meta<typeof StagedChanges>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Waiting: Story = {};

export const None: Story = { args: { changes: [] } };

export const Approves: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Approve the change to default_rate_limit_per_minute",
      }),
    );
    await expect(args.onTransition).toHaveBeenCalledWith(
      runtime.pending[0],
      "approved",
    );
  },
};

export const ApplyFails: Story = {
  args: {
    onTransition: fn(async () => {
      throw new Error(
        "The settings moved on since this change was staged; stage it again.",
      );
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /^Apply the change/ }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "stage it again",
    );
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { runtime } from "../../storybook/fixtures/settings";
import { RevisionHistory } from "./RevisionHistory";

const meta = {
  title: "Settings/Parts/Revision history",
  component: RevisionHistory,
  parameters: { layout: "padded" },
  args: {
    revisions: runtime.revisions,
    current: runtime.revision,
    onRollback: fn(async () => {}),
  },
} satisfies Meta<typeof RevisionHistory>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Revisions: Story = {};

export const None: Story = { args: { revisions: [], current: 0 } };

export const RollsBack: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Roll back to revision 6" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("button", { name: "Roll back" }),
    );
    await expect(args.onRollback).toHaveBeenCalledWith(6, 7);
  },
};

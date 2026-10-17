import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { CopyField } from "./CopyField";

const meta = {
  title: "Shared/Copy field",
  component: CopyField,
  parameters: { layout: "padded" },
  args: {
    label: "Copy API key",
    value: "znt_live_7f3c2a91b04e4d6f8a1c9e2b5d7f0a3c",
    onCopy: fn(),
  },
} satisfies Meta<typeof CopyField>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Secret: Story = {};

export const Copies: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Copy API key" }));
    await expect(args.onCopy).toHaveBeenCalledWith(args.value);
    await expect(
      await canvas.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  },
};

export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 280 }}>
        <Story />
      </div>
    ),
  ],
};

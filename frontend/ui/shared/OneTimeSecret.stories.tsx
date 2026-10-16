import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { OneTimeSecret } from "./OneTimeSecret";

/** A key shown once, with a copy that says it worked. A candidate for @calliopelabs/ui. */
const meta = {
  title: "Shared/OneTimeSecret",
  component: OneTimeSecret,
  args: {
    label: "API key for support-bot",
    value: "znt_live_91ab4c2e7d0f6a3b8e5c1d9f2a7b4e6c",
    onCopy: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OneTimeSecret>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Copied: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Copy API key for support-bot" }),
    );
    await expect(args.onCopy).toHaveBeenCalledWith(args.value);
    await expect(canvas.getByRole("status")).toHaveTextContent("Copied");
  },
};

export const CopyFails: Story = {
  args: { onCopy: fn(() => Promise.reject(new Error("denied"))) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Copy/ }));
    await expect(await canvas.findByText(/Copy failed/)).toBeInTheDocument();
  },
};

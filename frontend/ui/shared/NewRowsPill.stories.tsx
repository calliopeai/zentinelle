import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { NewRowsPill } from "./NewRowsPill";

const meta = {
  title: "Shared/NewRowsPill",
  component: NewRowsPill,
  args: { count: 3, onShow: fn(), label: (n: number) => `${n} new events` },
} satisfies Meta<typeof NewRowsPill>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Held: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "3 new events" }),
    );
    await expect(args.onShow).toHaveBeenCalled();
  },
};

export const One: Story = { args: { count: 1, label: undefined } };

/** Nothing held: nothing drawn. */
export const None: Story = {
  args: { count: 0 },
  render: (args) => (
    <div>
      <NewRowsPill {...args} />
      <p className="text-sm text-muted-foreground">
        The pill is hidden at zero.
      </p>
    </div>
  ),
};

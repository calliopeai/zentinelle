import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Loaded } from "./Loaded";

const meta = {
  title: "Settings/Parts/Loaded",
  component: Loaded<string>,
  parameters: { layout: "padded" },
  args: {
    label: "organization settings",
    value: { data: "Acme Robotics" },
    children: (name: string) => <p>{name}</p>,
  },
} satisfies Meta<typeof Loaded<string>>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Loading: Story = {
  args: { value: { data: null, loading: true } },
};

export const Failed: Story = {
  args: {
    value: { data: null, error: { message: "Network error" }, retry: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Could not load organization settings"),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: /try again|retry/i }),
    );
    await expect(args.value.retry).toHaveBeenCalled();
  },
};

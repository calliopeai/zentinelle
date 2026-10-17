import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { ViewSwitch } from "./ViewSwitch";

const meta = {
  title: "Patterns/ViewSwitch",
  component: ViewSwitch,
  args: {
    label: "Register views",
    active: "matrix",
    views: [
      { key: "list", label: "List", href: "/risks" },
      { key: "matrix", label: "Matrix", href: "/risks?view=matrix" },
      { key: "rpn", label: "By RPN", href: "/risks?view=rpn" },
    ],
  },
} satisfies Meta<typeof ViewSwitch>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: "Matrix" }),
    ).toHaveAttribute("aria-current", "page");
  },
};

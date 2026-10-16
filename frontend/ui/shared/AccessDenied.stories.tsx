import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { AccessDenied } from "./AccessDenied";

const meta = {
  title: "Shared/Access denied",
  component: AccessDenied,
  args: { what: "Providers", role: "admin" },
} satisfies Meta<typeof AccessDenied>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Providers needs the admin role"),
    ).toBeInTheDocument();
  },
};

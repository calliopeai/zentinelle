import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { ForbiddenState } from "./ForbiddenState";

const meta = {
  title: "Shared/Forbidden state",
  component: ForbiddenState,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ForbiddenState>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: "Back to Overview" }),
    ).toHaveAttribute("href", "/dashboard");
  },
};

export const AdminOnly: Story = {
  args: {
    title: "Settings need the admin role",
    description:
      "Organization settings, API keys, integrations and data retention are open to admins only. Ask an admin in your organization.",
  },
};
